import {Protocol} from "trac-peer";
import fhe from 'fhe-contract-kit';
import { hkdfSync } from 'node:crypto';

class SampleProtocol extends Protocol{

    /**
     * Extending from Protocol inherits its capabilities and allows you to define your own protocol.
     * The protocol supports the corresponding contract. Both files come in pairs.
     *
     * Instances of this class do NOT run in contract context. The constructor is only called once on Protocol
     * instantiation.
     *
     * this.peer: an instance of the entire Peer class, the actual node that runs the contract and everything else.
     * this.base: the database engine, provides await this.base.view.get('key') to get unsigned data (not finalized data).
     * this.options: the option stack passed from Peer instance.
     *
     * @param peer
     * @param base
     * @param options
     */
    constructor(peer, base, options = {}) {
        // calling super and passing all parameters is required.
        super(peer, base, options);
    }

    /**
     * The Protocol superclass ProtocolApi instance already provides numerous api functions.
     * You can extend the built-in api based on your protocol requirements.
     *
     * @returns {Promise<void>}
     */
    async extendApi(){
        this.api.getSampleData = function(){
            return 'Some sample data';
        }
    }

    /**
     * In order for a transaction to successfully trigger,
     * you need to create a mapping for the incoming tx command,
     * pointing at the contract function to execute.
     *
     * You can perform basic sanitization here, but do not use it to protect contract execution.
     * Instead, use the built-in schema support for in-contract sanitization instead
     * (Contract.addSchema() in contract constructor).
     *
     * @param command
     * @returns {{type: string, value: *}|null}
     */
    mapTxCommand(command){
        // prepare the payload
        let obj = { type : '', value : null };
        /*
        Triggering contract function in terminal will look like this:

        /tx --command 'something'

        You can also simulate a tx prior broadcast

        /tx --command 'something' --sim 1

        To programmatically execute a transaction from "outside",
        the api function "this.api.tx()" needs to be exposed by adding
        "api_tx_exposed : true" to the Peer instance options.
        Once exposed, it can be used directly through peer.protocol_instance.api.tx()

        Please study the superclass of this Protocol and Protocol.api to learn more.
        */
        if(command === 'something'){
            // type points at the "storeSomething" function in the contract.
            obj.type = 'storeSomething';
            // value can be null as there is no other payload, but the property must exist.
            obj.value = null;
            // return the payload to be used in your contract
            return obj;
        } else {
            /*
            now we assume our protocol allows to submit a json string with information
            what to do (the op) then we pass the parsed object to the value.
            the accepted json string can be executed as tx like this:

            /tx --command '{ "op" : "do_something", "some_key" : "some_data" }'

            Of course we can simulate this, as well:

            /tx --command '{ "op" : "do_something", "some_key" : "some_data" }' --sim 1
            */
            const json = this.safeJsonParse(command);
            if(json.op !== undefined) {
                if(json.op === 'do_something'){
                    obj.type = 'submitSomething';
                    obj.value = json;
                    return obj;
                }
                if(json.op === 'set_fhe_keys'){
                    obj.type = 'setFheKeys';
                    obj.value = { serverKeyB64: json.serverKeyB64, publicKeyB64: json.publicKeyB64 };
                    return obj;
                }
                if(json.op === 'submit_age'){
                    obj.type = 'submitAge';
                    obj.value = { ctB64: json.ctB64 };
                    return obj;
                }
            }
        }
        // return null if no case matches.
        // if you do not return null, your protocol might behave unexpected.
        return null;
    }

    /**
     * Prints additional options for your protocol underneath the system ones in terminal.
     *
     * @returns {Promise<void>}
     */
    async printOptions(){
        console.log(' ');
        console.log('- Sample Commands:');
        console.log("- /print | use this flag to print some text to the terminal: '--text \"I am printing\"'");
        console.log("- /myage <age> | encrypts <age> with FHE and prints a ready-to-paste /tx command");
        // further protocol specific options go here
    }

    /**
     * Extend the terminal system commands and execute your custom ones for your protocol.
     * This is not transaction execution itself (though can be used for it based on your requirements).
     * For transactions, use the built-in /tx command in combination with command mapping (see above)
     *
     * @param input
     * @returns {Promise<void>}
     */
    async customCommand(input) {
        await super.tokenizeInput(input);
        if (this.input.startsWith("/print")) {
            const splitted = this.parseArgs(input);
            console.log(splitted.text);
            return;
        }

        if (this.input.startsWith('/myage')) {
            // parse age from the rest of the input
            const parts = input.trim().split(/\s+/);
            if (parts.length < 2) {
                console.log('Usage: /myage <age>');
                return;
            }
            const ageNum = Number(parts[1]);
            if (!Number.isInteger(ageNum) || ageNum < 0) {
                console.log('Please provide a non-negative integer age');
                return;
            }

            // Ensure wallet has a valid keypair (ed25519) available
            const w = this.peer && this.peer.wallet ? this.peer.wallet : null;
            const hasWalletKey = !!(w && (w.privateKey || w.secretKey || w.seed || w.publicKey));
            if (!hasWalletKey) {
                console.log('[fhe] No wallet keypair available. Create or load a wallet first.');
                return;
            }

            // Ensure we have a public key; if missing, suggest a tx to set keys
            let pkB64Entry = await this.base.view.get('fhe/publicKeyB64');
            let skB64Entry = await this.base.view.get('fhe/serverKeyB64');
            if (pkB64Entry === null || skB64Entry === null) {
                // Auto-publish contract-wide FHE keys derived from wallet and retry
                const wpriv = (w.privateKey || w.secretKey || w.seed);
                if (!wpriv) {
                    console.log('[fhe] Wallet does not expose a private key for seeding. Cannot publish keys automatically.');
                    return;
                }
                const skStr = typeof wpriv === 'string' ? wpriv : String(wpriv);
                let ikm;
                if (/^[0-9a-fA-F]+$/.test(skStr) && (skStr.length % 2 === 0)) {
                    ikm = Buffer.from(skStr, 'hex');
                } else {
                    try { ikm = Buffer.from(skStr, 'base64'); }
                    catch { ikm = Buffer.from(skStr, 'utf8'); }
                }
                const seed = hkdfSync('sha256', ikm, Buffer.from('trac-fhe-v1'), Buffer.from('fhe-seed'), 32);
                const { serverKey, publicKey } = fhe.keygenFromSeed(seed);
                const serverKeyB64 = fhe.b64.toB64(serverKey);
                const publicKeyB64 = fhe.b64.toB64(publicKey);

                const setKeysCmd = JSON.stringify({ op: 'set_fhe_keys', serverKeyB64, publicKeyB64 });
                let published = false;
                try {
                    if (this.api && typeof this.api.prepareTxCommand === 'function' && typeof this.api.tx === 'function') {
                        const prepared = this.api.prepareTxCommand(setKeysCmd);
                        // Try best-effort submission; API fills wallet/signature internally when exposed
                        await this.api.tx(undefined, prepared);
                        published = true;
                    }
                } catch (e) {
                    console.log('[fhe] Auto-publish failed:', e?.message || e);
                }
                if (!published) {
                    console.log('Paste to publish keys:');
                    console.log(`/tx --command '${setKeysCmd}'`);
                    return;
                }
                // reload entries after publishing
                pkB64Entry = await this.base.view.get('fhe/publicKeyB64');
                skB64Entry = await this.base.view.get('fhe/serverKeyB64');
                if (pkB64Entry === null || skB64Entry === null) {
                    console.log('[fhe] Keys not visible in state yet. Try again shortly.');
                    return;
                }
            }
            const v = pkB64Entry.value !== undefined ? pkB64Entry.value : pkB64Entry;
            const pkBuf = fhe.b64.fromB64(v);

            // Encrypt age with public key and print a ready /tx command
            const ct = fhe.encryptU64WithPublicKey(BigInt(ageNum), pkBuf);
            const ctB64 = fhe.b64.toB64(ct);
            // Auto-submit the age tx; fallback to printing command if API is not available
            const submitCmd = JSON.stringify({ op: 'submit_age', ctB64 });
            let submitted = false;
            try {
                if (this.api && typeof this.api.prepareTxCommand === 'function' && typeof this.api.tx === 'function') {
                    const prepared = this.api.prepareTxCommand(submitCmd);
                    await this.api.tx(undefined, prepared);
                    submitted = true;
                    console.log('[fhe] Submitted encrypted age transaction.');
                }
            } catch (e) {
                console.log('[fhe] Auto-submit failed:', e?.message || e);
            }
            if (!submitted) {
                console.log('Paste to submit age:');
                console.log(`/tx --command '${submitCmd}'`);
            }
            return;
        }
    }
}

export default SampleProtocol;
