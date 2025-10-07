import {Contract} from 'trac-peer'
import fhe from 'fhe-contract-kit'

class SampleContract extends Contract {
    /**
     * Extending from Contract inherits its capabilities and allows you to define your own contract.
     * The contract supports the corresponding protocol. Both files come in pairs.
     *
     * Instances of this class run in contract context. The constructor is only called once on Peer
     * instantiation.
     *
     * Please avoid using the following in your contract functions:
     *
     * No try-catch
     * No throws
     * No random values
     * No http / api calls
     * No super complex, costly calculations
     * No massive storage of data.
     * Never, ever modify "this.op" or "this.value", only read from it and use safeClone to modify.
     * ... basically nothing that can lead to inconsistencies akin to Blockchain smart contracts.
     *
     * Running a contract on Trac gives you a lot of freedom, but it comes with additional responsibility.
     * Make sure to benchmark your contract performance before release.
     *
     * If you need to inject data from "outside", you can utilize the Feature class and create your own
     * oracles. Instances of Feature can be injected into the main Peer instance and enrich your contract.
     *
     * In the current version (Release 1), there is no inter-contract communication yet.
     * This means it's not suitable yet for token standards.
     * However, it's perfectly equipped for interoperability or standalone tasks.
     *
     * this.protocol: the peer's instance of the protocol managing contract concerns outside of its execution.
     * this.options: the option stack passed from Peer instance
     *
     * @param protocol
     * @param options
     */
    constructor(protocol, options = {}) {
        // calling super and passing all parameters is required.
        super(protocol, options);

        // simple function registration.
        // since this function does not expect value payload, no need to sanitize.
        // note that the function must match the type as set in Protocol.mapTxCommand()
        this.addFunction('storeSomething');

        // now we register the function with a schema to prevent malicious inputs.
        // the contract uses the schema generator "fastest-validator" and can be found on npmjs.org.
        //
        // Since this is the "value" as of Protocol.mapTxCommand(), we must take it full into account.
        // $$strict : true tells the validator for the object structure to be precise after "value".
        //
        // note that the function must match the type as set in Protocol.mapTxCommand()
        this.addSchema('submitSomething', {
            value : {
                $$strict : true,
                $$type: "object",
                op : { type : "string", min : 1, max: 128 },
                some_key : { type : "string", min : 1, max: 128 }
            }
        });

        // FHE integration schemas
        this.addSchema('setFheKeys', {
            value: {
                $$strict: true,
                $$type: 'object',
                serverKeyB64: { type: 'string', min: 1 },
                publicKeyB64: { type: 'string', min: 1 }
            }
        });

        this.addSchema('submitAge', {
            value: {
                $$strict: true,
                $$type: 'object',
                ctB64: { type: 'string', min: 1 }
            }
        });

        // in preparation to add an external Feature (aka oracle), we add a loose schema to make sure
        // the Feature key is given properly. it's not required, but showcases that even these can be
        // sanitized.
        this.addSchema('feature_entry', {
            key : { type : "string", min : 1, max: 256 },
            value : { type : "any" }
        });

        // now we are registering the timer feature itself (see /features/time/ in package).
        // note the naming convention for the feature name <feature-name>_feature.
        // the feature name is given in app setup, when passing the feature classes.
        const _this = this;

        // this feature registers incoming data from the Feature and if the right key is given,
        // stores it into the smart contract storage.
        // the stored data can then be further used in regular contract functions.
        this.addFeature('timer_feature', async function(){
            if(false === _this.validateSchema('feature_entry', _this.op)) return;
            if(_this.op.key === 'currentTime') {
                if(null === await _this.get('currentTime')) console.log('timer started at', _this.op.value);
                await _this.put(_this.op.key, _this.op.value);
            }
        });

        // last but not least, you may intercept messages from the built-in
        // chat system, and perform actions similar to features to enrich your
        // contract. check the _this.op value after you enabled the chat system
        // and posted a few messages.
        this.messageHandler(async function(){
            console.log('message triggered contract', _this.op);
        });
    }

    /**
     * A simple contract function without values (=no parameters).
     *
     * Contract functions must be registered through either "this.addFunction" or "this.addSchema"
     * or it won't execute upon transactions. "this.addFunction" does not sanitize values, so it should be handled with
     * care or be used when no payload is to be expected.
     *
     * Schema is recommended to sanitize incoming data from the transaction payload.
     * The type of payload data depends on your protocol.
     *
     * This particular function does not expect any payload, so it's fine to be just registered using "this.addFunction".
     *
     * However, as you can see below, what it does is checking if an entry for key "something" exists already.
     * With the very first tx executing it, it will return "null" (default value of this.get if no value found).
     * From the 2nd tx onwards, it will print the previously stored value "there is something".
     *
     * It is recommended to check for null existence before using put to avoid duplicate content.
     *
     * As a rule of thumb, all "this.put()" should go at the end of function execution to avoid code security issues.
     *
     * Putting data is atomic, should a Peer with a contract interrupt, the put won't be executed.
     */
    async storeSomething(){
        const something = await this.get('something');

        console.log('is there already something?', something);

        if(null === something) {
            await this.put('something', 'there is something');
        }
    }

    /**
     * Now we are using the schema-validated function defined in the constructor.
     *
     * The function also showcases some of the handy features like safe functions
     * to prevent throws and safe bigint/decimal conversion.
     */
    async submitSomething(){
        // the value of some_key shouldn't be empty, let's check that
        if(this.value.some_key === ''){
            return new Error('Cannot be empty');
            // alternatively false for generic errors:
            // return false;
        }

        // of course the same works with assert (always use this.assert)
        this.assert(this.value.some_key !== '', new Error('Cannot be empty'));

        // btw, please use safeBigInt provided by the contract protocol's superclass
        // to calculate big integers:
        const bigint = this.protocol.safeBigInt("1000000000000000000");

        // making sure it didn't fail
        this.assert(bigint !== null);

        // you can also convert a bigint string into its decimal representation (as string)
        const decimal = this.protocol.fromBigIntString(bigint.toString(), 18);

        // and back into a bigint string
        const bigint_string = this.protocol.toBigIntString(decimal, 18);

        // let's clone the value
        const cloned = this.protocol.safeClone(this.value);

        // we want to pass the time from the timer feature.
        // since mmodifications of this.value is not allowed, add this to the clone instead for storing:
        cloned['timestamp'] = await this.get('currentTime');

        // making sure it didn't fail (be aware of false-positives if null is passed to safeClone)
        this.assert(cloned !== null);

        // and now let's stringify the cloned value
        const stringified = this.protocol.safeJsonStringify(cloned);

        // and, you guessed it, best is to assert against null once more
        this.assert(stringified !== null);

        // and guess we are parsing it back
        const parsed = this.protocol.safeJsonParse(stringified);

        // parsing the json is a bit different: instead of null, we check against undefined:
        this.assert(parsed !== undefined);

        // finally we are storing what address submitted the tx and what the value was
        await this.put('submitted_by/'+this.address, parsed.some_key);

        // printing into the terminal works, too of course:
        console.log('submitted by', this.address, parsed);
    }

    /**
     * Store FHE server/public keys (base64) in contract state.
     * Server key is public and needed for homomorphic ops; public key lets
     * participants encrypt client-side. Never publish clientKey.
     */
    async setFheKeys(){
        const sk = this.value.serverKeyB64;
        const pk = this.value.publicKeyB64;
        // Idempotent puts
        await this.put('fhe/serverKeyB64', sk);
        await this.put('fhe/publicKeyB64', pk);
    }

    /**
     * Accept encrypted age (base64), compute lte18 = NOT(gt(age,18)), and
     * store the encrypted boolean under ageCheck/<address>.
     */
    async submitAge(){

        // Load server key from state and set it for deterministic evaluation
        const skEntry = await this.get('fhe/serverKeyB64');
        this.assert(skEntry !== null, new Error('FHE server key not set'));
        const serverKey = fhe.b64.fromB64(skEntry);
        fhe.setServerKey(serverKey);

        // Decode ciphertext and evaluate enc<=18
        const ct = fhe.b64.fromB64(this.value.ctB64);
        const gt = fhe.gtU64Clear(ct, 18n);
        const lte = fhe.not(gt);

        // Store encrypted boolean result for this address
        const resB64 = fhe.b64.toB64(lte);
        await this.put('ageCheck/' + this.address, resB64);
    }
}

export default SampleContract;
