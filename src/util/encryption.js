import { encodeUTF8 } from './utf8';
import JoinedBuffer from './JoinedBuffer';

// useful resources:
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
// https://github.com/diafygi/webcrypto-examples/

const IV_BYTES = 96 / 8;
const TOKEN_BYTES = 16;

const DH_KEY_ALGORITHM = { name: 'ECDH', namedCurve: 'P-521' };
const DH_KEY_USAGES = ['deriveKey'];

const DH_D_KEY_ALGORITHM = { name: 'AES-GCM', length: 256 };
const DH_D_KEY_USAGES = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'];

const SECRET_KEY_ALGORITHM = { name: 'AES-GCM', length: 256 };
const SECRET_KEY_USAGES = ['encrypt', 'decrypt'];

const Crypto = window.crypto.subtle;

function randomBytes(bytes) {
	const array = new Uint8Array(bytes);
	window.crypto.getRandomValues(array);
	return array;
}

function aesGcmOptions(iv, senderIdentity) {
	return {
		name: 'AES-GCM',
		iv,
		additionalData: encodeUTF8(senderIdentity || ''),
		tagLength: 128,
	};
}

async function encrypt(key, data, senderIdentity = null) {
	const iv = randomBytes(IV_BYTES);
	const encrypted = await Crypto.encrypt(aesGcmOptions(iv, senderIdentity), key, data);
	return new JoinedBuffer(iv, encrypted);
}

async function decrypt(key, data, senderIdentity = null) {
	const [iv, encrypted] = new JoinedBuffer(data).split(IV_BYTES);
	return new Uint8Array(await Crypto.decrypt(aesGcmOptions(iv, senderIdentity), key, encrypted));
}

function bytesEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; ++ i) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

async function makeAnswer(sharedKey, token, id, password) {
	// encrypt before hashing to ensure a MITM can't simply decrypt a
	// legitimate answer and re-encrypt with a different key
	const combinedCrypt = await Crypto.encrypt(
		aesGcmOptions(token.subarray(0, IV_BYTES)),
		sharedKey,
		new JoinedBuffer(id, token, password).toBytes(),
	);

	// stretching with fixed iteration count
	let current = combinedCrypt;
	for (let i = 0; i < 1024; ++ i) {
		current = await Crypto.digest('SHA-512', current);
	}

	return new Uint8Array(current);
}

export class SecretKeeper {
	constructor() {
		this.secretKey = null;
	}

	async createSecret() {
		this.secretKey = await Crypto.generateKey(
			SECRET_KEY_ALGORITHM,
			true,
			SECRET_KEY_USAGES
		);
	}

	async wrap(senderIdentity, wrappingKey) {
		const iv = randomBytes(IV_BYTES);
		return new JoinedBuffer(iv, await Crypto.wrapKey(
			'raw',
			this.secretKey,
			wrappingKey,
			aesGcmOptions(iv, senderIdentity)
		));
	}

	async unwrap(senderIdentity, data, unwrappingKey) {
		const [iv, wrapped] = new JoinedBuffer(data).split(IV_BYTES);
		this.secretKey = await Crypto.unwrapKey(
			'raw',
			wrapped,
			unwrappingKey,
			aesGcmOptions(iv, senderIdentity),
			SECRET_KEY_ALGORITHM,
			true,
			SECRET_KEY_USAGES
		);
	}

	canDecrypt() {
		return Boolean(this.secretKey);
	}

	encrypt(senderIdentity, data) {
		if (!this.secretKey) {
			throw new Error('not connected');
		}
		return encrypt(this.secretKey, data, senderIdentity);
	}

	decrypt(senderIdentity, data) {
		if (!this.secretKey) {
			throw new Error('not connected');
		}
		return decrypt(this.secretKey, data, senderIdentity);
	}
}

export class ChallengeIssuer {
	constructor(password) {
		this.password = password;
		this.stage = 0;
	}

	async issue() {
		if (this.stage !== 0) {
			throw new Error('unexpected state');
		}
		++ this.stage;

		this.token = randomBytes(TOKEN_BYTES);
		this.ecKey = await Crypto.generateKey(DH_KEY_ALGORITHM, false, DH_KEY_USAGES);
		const publicKey = await Crypto.exportKey('raw', this.ecKey.publicKey);
		return new JoinedBuffer(this.token, publicKey);
	}

	async handleAnswer(id, data) {
		if (this.stage !== 1) {
			throw new Error('unexpected state');
		}
		++ this.stage;

		const [publicKey, encryptedAnswer] = new JoinedBuffer(data).split(JoinedBuffer.DYNAMIC);

		const senderPublicEcKey = await Crypto.importKey(
			'raw',
			publicKey,
			DH_KEY_ALGORITHM,
			false,
			[],
		);

		const sharedKey = await Crypto.deriveKey(
			{ name: 'ECDH', namedCurve: 'P-521', public: senderPublicEcKey },
			this.ecKey.privateKey,
			DH_D_KEY_ALGORITHM,
			false,
			DH_D_KEY_USAGES,
		);
		const expectedAnswer = await makeAnswer(sharedKey, this.token, id, this.password);
		const answer = await decrypt(sharedKey, encryptedAnswer);

		return bytesEqual(answer, expectedAnswer) ? sharedKey : null;
	}
}

export class ChallengeResponder {
	constructor() {
		this.stage = 0;
	}

	async handleIssue(data) {
		if (this.stage !== 0) {
			throw new Error('unexpected state');
		}
		++ this.stage;

		const [token, publicKey] = new JoinedBuffer(data).split(TOKEN_BYTES);
		this.token = token;
		const senderPublicEcKey = await Crypto.importKey(
			'raw',
			publicKey,
			DH_KEY_ALGORITHM,
			false,
			[],
		);
		this.ecKey = await Crypto.generateKey(DH_KEY_ALGORITHM, false, DH_KEY_USAGES);

		this.sharedKey = await Crypto.deriveKey(
			{ name: 'ECDH', namedCurve: 'P-521', public: senderPublicEcKey },
			this.ecKey.privateKey,
			DH_D_KEY_ALGORITHM,
			false,
			DH_D_KEY_USAGES,
		);
	}

	async answer(id, password) {
		if (this.stage !== 1) {
			throw new Error('unexpected state');
		}
		++ this.stage;

		const answer = await makeAnswer(this.sharedKey, this.token, id, password);
		return new JoinedBuffer()
			.addDynamic(await Crypto.exportKey('raw', this.ecKey.publicKey))
			.addFixed(await encrypt(this.sharedKey, answer));
	}

	getUnwrappingKey() {
		return this.sharedKey;
	}
}
