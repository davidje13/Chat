import { encodeUTF8, join } from './buffer';

// useful resources:
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
// https://github.com/diafygi/webcrypto-examples/

const Crypto = window.crypto.subtle;

function randomBytes(bytes) {
	const array = new Uint8Array(bytes);
	window.crypto.getRandomValues(array);
	return array;
}

const IV_BYTES = 96 / 8;

function aesGcmOptions(iv, senderIdentity) {
	return {
		name: 'AES-GCM',
		iv,
		additionalData: encodeUTF8(senderIdentity),
		tagLength: 128,
	};
}

const TOKEN_BYTES = 16;

const DH_KEY_ALGORITHM = { name: 'ECDH', namedCurve: 'P-521' };
const DH_KEY_USAGES = ['deriveKey'];

const DH_D_KEY_ALGORITHM = { name: 'AES-GCM', length: 256 };
const DH_D_KEY_USAGES = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'];

const SECRET_KEY_ALGORITHM = { name: 'AES-GCM', length: 256 };
const SECRET_KEY_USAGES = ['encrypt', 'decrypt'];

async function makeAnswer(sharedKey, token, id, password) {
	const combined = join(encodeUTF8(id), token, encodeUTF8(password));

	// encrypt before hashing to ensure a MITM can't simply decrypt a
	// legitimate answer and re-encrypt with a different key
	const combinedCrypt = await Crypto.encrypt(
		aesGcmOptions(token.subarray(0, IV_BYTES)),
		sharedKey,
		combined,
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
		return join(iv, await Crypto.wrapKey(
			'raw',
			this.secretKey,
			wrappingKey,
			aesGcmOptions(iv, senderIdentity)
		));
	}

	async unwrap(senderIdentity, data, unwrappingKey) {
		const iv = data.subarray(0, IV_BYTES);
		this.secretKey = await Crypto.unwrapKey(
			'raw',
			data.subarray(IV_BYTES),
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

	async encrypt(senderIdentity, data) {
		if (!this.secretKey) {
			throw new Error('not connected');
		}
		const iv = randomBytes(IV_BYTES);
		return join(iv, await Crypto.encrypt(
			aesGcmOptions(iv, senderIdentity),
			this.secretKey,
			data,
		));
	}

	async decrypt(senderIdentity, data) {
		if (!this.secretKey) {
			throw new Error('not connected');
		}
		const iv = data.subarray(0, IV_BYTES);
		return new Uint8Array(await Crypto.decrypt(
			aesGcmOptions(iv, senderIdentity),
			this.secretKey,
			data.subarray(IV_BYTES),
		));
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

		this.ecKey = await Crypto.generateKey(DH_KEY_ALGORITHM, true, DH_KEY_USAGES);
		const publicKey = await Crypto.exportKey('raw', this.ecKey.publicKey);
		this.token = randomBytes(TOKEN_BYTES);
		return join(this.token, publicKey);
	}

	async handleAnswer(id, data) {
		if (this.stage !== 1) {
			throw new Error('unexpected state');
		}
		++ this.stage;

		const header = new Uint32Array(data.buffer, data.byteOffset, 1);
		const publicKeyLen = header[0];
		const encryptedAnswer = data.subarray(publicKeyLen + 4);

		const senderPublicEcKey = await Crypto.importKey(
			'raw',
			data.subarray(4, publicKeyLen + 4),
			DH_KEY_ALGORITHM,
			false,
			[],
		);

		const sharedKey = await Crypto.deriveKey(
			{
				name: 'ECDH',
				namedCurve: 'P-521',
				public: senderPublicEcKey,
			},
			this.ecKey.privateKey,
			DH_D_KEY_ALGORITHM,
			false,
			DH_D_KEY_USAGES,
		);
		const expectedAnswer = await makeAnswer(sharedKey, this.token, id, this.password);
		const iv = encryptedAnswer.subarray(0, IV_BYTES);
		const answer = new Uint8Array(await Crypto.decrypt(
			aesGcmOptions(iv),
			sharedKey,
			encryptedAnswer.subarray(IV_BYTES),
		));
		if (answer.length !== expectedAnswer.length) {
			return null;
		}
		for (let i = 0; i < expectedAnswer.length; ++ i) {
			if (answer[i] !== expectedAnswer[i]) {
				return null;
			}
		}

		return sharedKey;
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

		this.token = data.subarray(0, TOKEN_BYTES);
		this.senderPublicEcKey = await Crypto.importKey(
			'raw',
			data.subarray(TOKEN_BYTES),
			DH_KEY_ALGORITHM,
			false,
			[],
		);
		this.ecKey = await Crypto.generateKey(DH_KEY_ALGORITHM, true, DH_KEY_USAGES);

		this.sharedKey = await Crypto.deriveKey(
			{
				name: 'ECDH',
				namedCurve: 'P-521',
				public: this.senderPublicEcKey,
			},
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
		const iv = randomBytes(IV_BYTES);
		const encrypted = await Crypto.encrypt(aesGcmOptions(iv), this.sharedKey, answer);
		const publicKey = await Crypto.exportKey('raw', this.ecKey.publicKey);
		return join(
			Uint32Array.of(publicKey.byteLength),
			publicKey,
			iv,
			encrypted,
		);
	}

	getUnwrappingKey() {
		return this.sharedKey;
	}
}
