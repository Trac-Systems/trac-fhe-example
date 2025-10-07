# Contract Example

Contracts on Trac Network are infrastructure. 

This means each participant executes contracts in distributed apps (App3: decentralized apps / embedded contracts).

Alternatively a group of Peers (nodes) may accept transactions from external wallets to offer traditional web3 experiences.

The most important files to check out and learn how everything works are:

- **/contract/protocol.js**: defines the framework for the contract.
- **/contract/contract.js**: the actual contract.
- **/features/timer/index.js**: a Feature (aka oracle) for the contract
- **/desktop/index.html** and **/desktop/index.js**: to learn running as App3 (see bottom notes)
- **/index.js**: the setup for the contract app that everyone uses (the entire package represents an app)

Release 1 (R1) must be used alongside Trac Network R1 releases to maintain contract consistency.

Trac Apps utilizes the [Pear Runtime and Holepunch](https://pears.com/).

## Install

```shell
git clone git@github.com:Trac-Systems/trac-contract-example.git
```

While the Trac apps support native node-js, it is encouraged to use Pear:

```js
cd trac-contract-example
npm install -g pear
npm install
pear run . store1
```

## Setup

**Deploy Bootstrap (admin):**

- Choose option 1)
- Copy and backup the seedphrase
- Copy the "Peer Writer" key from the Peer section (basically the contract address)
- With a text editor, open the file index.js in document root
- Replace the bootstrap address in the example section (not the MSB) with the copied writer address
- Choose a channel name (exactly 32 characters)
- Type /exit and hit enter, then run again: pear run . store1
- After the options appear, type "/add_admin --address YourPeerAddress" and hit enter
- Your instance is now the Bootstrap and admin peer of your contract network.
- Keep your bootstrap node running
- For production contracts, it is strongly recommended to add a couple of indexers. See below.

**Running indexers (admin)**

- Install on different machines than the Bootstrap's (ideally different data centers) with the exact setup in index.js
- Upon start ("pear run . store1") copy the "Peer Writer" key
- In the Bootstrap node screen, add the indexer: "/add_indexer --key TheIndexerWriterKey."
- You should see a success confirmation
- Usually 2 indexers on different locations are enough, we recommend 2 to max. 4 in addition to the Bootstrap

**Enable others to join and to transact:**

- By default, people cannot auto-join the contract network. The network admin (the Bootstrap in this case) can enable auto-join
- To enable auto-join, in the screen of the Bootstrap enter "/set_auto_add_writers --enabled 1"
- Any other Peer joining with the exact same setup can join the network and execute contract functions and transactions.
- Users may join using the exact same setup in index.js and start using "pear run . store1"
- For more features, play around with the available system and chat options.

# App3
- To see some magic, edit the package.json and edit the following fields:
- **"main": "index.js"** to **"main": "index.html"**
- In the "pear" section **"type": "terminal"** to **"type": "desktop"**
- Run: pear run -d . store1
- Wait for the app to load. -d starts the developer console. Check the console output
- Each desktop instance creates its own identity (wallet) automatically upon first start
- Note: mobile app deployment is in the works by the team.

# Web3
If your contract is not supposed to run as user-installable app, you can run it as server instead.
There is no special setup required other than exposing the Protocol api to your services.

To allow signers with webwallets to submit transactions through your server, enable the transaction API.
For chat messages, accordingly. See below.

Note: Trac Network mainnet is not released yet and there are no web wallets at this moment. 
But you may create an identity wallet to sign off transactions for web3 apps. 
We recommend to use the library ["micro-key-producer/slip10.js"](https://www.npmjs.com/package/micro-key-producer) package for this (using ed25519 keys).

You can find all built-in api functions in trac-peer/src/api.js
Custom api functions (per-app) can be found in /contract/protocol.js and vary by the different app projects.

```js
peer_opts.api_tx_exposed = true;
peer_opts.api_msg_exposed = true;
```

## FHE Age Check (`/myage`)

This example integrates a vendored `fhe-contract-kit` (TFHE‑rs) to demonstrate an encrypted age check in the contract.

- Auto-publish FHE keys: on first run, if keys are missing, `/myage` derives deterministic FHE keys from the local wallet and auto-submits a tx to publish them (requires `api_tx_exposed = true`).
- Auto-submit age: `/myage <age>` encrypts and auto-submits your age. If API submission is unavailable, it prints the `/tx` command to paste manually.
  - The contract computes `age <= 18` homomorphically and stores the encrypted boolean at `ageCheck/<address>`.

Notes
- The result is stored encrypted. A holder of `clientKey` may decrypt off‑chain and optionally submit a plaintext reveal.
- Auto-publish uses a seed derived from the wallet (ed25519) private key via HKDF-SHA256. No private key leaves the device.

## FHE Bootstrap (Admin)

The kit supports deterministic keygen from the wallet’s ed25519 private key.

1) Build the vendored kit (done automatically on `npm i`): `./fhe-contract-kit`.
2) Derive a seed and generate keys off-chain, then publish them via `/tx`.

Example (Node REPL):

```js
// From project root
const { hkdfSync } = await import('node:crypto');
const fhe = (await import('./fhe-contract-kit/index.js')).default || (await import('./fhe-contract-kit/index.js'));

// Replace with your ed25519 private key bytes (hex/base64/utf8 as appropriate)
const ikm = Buffer.from('<WALLET_PRIVATE_KEY_HEX>', 'hex');
const seed = hkdfSync('sha256', ikm, Buffer.from('trac-fhe-v1'), Buffer.from('fhe-seed'), 32);
const { serverKey, publicKey } = fhe.keygenFromSeed(seed);

const serverKeyB64 = fhe.b64.toB64(serverKey);
const publicKeyB64 = fhe.b64.toB64(publicKey);
console.log(`/tx --command '{"op":"set_fhe_keys","serverKeyB64":"${serverKeyB64}","publicKeyB64":"${publicKeyB64}"}'`);
```

Publish that `/tx` command in the terminal once. Validators will read `serverKeyB64` and set it for evaluation; users encrypt to `publicKeyB64`.
