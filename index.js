import {getStorePath} from './src/functions.js';
import {App} from './src/app.js';
export * from 'trac-peer/src/functions.js'
import {default as SampleProtocol} from "./contract/protocol.js";
import {default as SampleContract} from "./contract/contract.js";
import {Timer} from "./features/timer/index.js";

console.log('Storage path:', getStorePath());

///// MSB SETUP
// To run this example, you don't need to create your own MSB
// Instead go with the options as-is. The below bootstrap is an MSB testnet (gasless).
const msb_opts = {};
msb_opts.bootstrap = 'a4951e5f744e2a9ceeb875a7965762481dab0a7bb0531a71568e34bf7abd2c53';
msb_opts.channel = '0002tracnetworkmainsettlementbus';
msb_opts.store_name = getStorePath() + '/msb-fhe';

///// SAMPLE CONTRACT SETUP
// The sample contract needs to be deployed first.
// See the README.md for further information.
const peer_opts = {};
peer_opts.protocol = SampleProtocol;
peer_opts.contract = SampleContract;
peer_opts.bootstrap = '0000000000000000000000000000000000000000000000000000000000000000';
peer_opts.channel = '0000000000000000000000000example';
peer_opts.store_name = getStorePath() + '/example-fhe';
peer_opts.api_tx_exposed = true;
peer_opts.api_msg_exposed = true;

///// FEATURES
// Pass multiple features (aka oracles) to the peer and inject data into
// your contract. Can also go the other way, depending on how you need it.
// You may add as many Features as you wish.
// In /src/app.js, the Features are being executed by the admin (usually the Peer Bootstrap)
const timer_opts = {};
timer_opts.update_interval = 60_000;

export const app = new App(msb_opts, peer_opts, [
    {
        name : 'timer',
        class : Timer,
        opts : timer_opts
    }
]);
await app.start();
