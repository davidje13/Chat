import { describe, it, expect } from '../framework';
import {
	SecretKeeper,
	ChallengeIssuer,
	ChallengeResponder,
} from '../../src/util/encryption';
import { encodeUTF8 } from '../../src/util/utf8';

describe('SecretKeeper', () => {
	it('encrypts and decrypts data', async () => {
		const secretKeeper = new SecretKeeper();
		await secretKeeper.createSecret();

		const data = encodeUTF8('test');
		const encrypted = (await secretKeeper.encrypt('foo', data)).toBytes();
		const decrypted = await secretKeeper.decrypt('foo', encrypted);
		expect(decrypted).toEqual(data);
	});

	it('validates ID integrity', async () => {
		const secretKeeper = new SecretKeeper();
		await secretKeeper.createSecret();

		const data = encodeUTF8('test');
		const encrypted = (await secretKeeper.encrypt('foo', data)).toBytes();
		await expect(secretKeeper.decrypt('nope', encrypted)).toReject();
	});

	it('validates key integrity', async () => {
		const secretKeeper = new SecretKeeper();
		const secretKeeper2 = new SecretKeeper();
		await secretKeeper.createSecret();
		await secretKeeper2.createSecret();

		const data = encodeUTF8('test');
		const encrypted = (await secretKeeper.encrypt('foo', data)).toBytes();
		await expect(secretKeeper2.decrypt('foo', encrypted)).toReject();
	});
});

describe('challenge flow', () => {
	it('shares the secret when successful', async () => {
		const password = 'my-pass';
		const id = 'me';

		const issuerSecret = new SecretKeeper();
		const issuer = new ChallengeIssuer(password);
		await issuerSecret.createSecret();

		const wire1 = (await issuer.issue()).toBytes();

		const responderSecret = new SecretKeeper();
		const responder = new ChallengeResponder();
		await responder.handleIssue(wire1);
		const wire2 = (await responder.answer(id, password)).toBytes();

		const wrappingKey = await issuer.handleAnswer(id, wire2);
		expect(wrappingKey).toBeTruthy();
		const wire3 = (await issuerSecret.wrap('abc', wrappingKey)).toBytes();

		const unwrappingKey = responder.getUnwrappingKey();
		expect(unwrappingKey).toBeTruthy();
		await responderSecret.unwrap('abc', wire3, unwrappingKey);

		const data = encodeUTF8('test');
		const encrypted = (await issuerSecret.encrypt('foo', data)).toBytes();
		const decrypted = await responderSecret.decrypt('foo', encrypted);
		expect(decrypted).toEqual(data);
	});

	it('returns no wrapping key if the password is wrong', async () => {
		const password = 'my-pass';
		const id = 'me';
		const issuer = new ChallengeIssuer(password);
		const responder = new ChallengeResponder();

		const wire1 = (await issuer.issue()).toBytes();
		await responder.handleIssue(wire1);
		const wire2 = (await responder.answer(id, 'wrong-password')).toBytes();
		const wrappingKey = await issuer.handleAnswer(id, wire2);
		expect(wrappingKey).toEqual(null);
	});

	async function negotiateKeyExchange(
		id1,
		secretKeeper1,
		id2,
		secretKeeper2,
		password,
	) {
		const issuer = new ChallengeIssuer(password);
		const wire1 = (await issuer.issue()).toBytes();
		const responder = new ChallengeResponder();
		await responder.handleIssue(wire1);
		const wire2 = (await responder.answer(id2, password)).toBytes();
		const wrappingKey = await issuer.handleAnswer(id2, wire2);
		const wire3 = (await secretKeeper1.wrap(id1, wrappingKey)).toBytes();
		const unwrappingKey = responder.getUnwrappingKey();
		await secretKeeper2.unwrap(id1, wire3, unwrappingKey);
	}

	it('allows multiple hops when sharing the key', async () => {
		const secret1 = new SecretKeeper();
		const secret2 = new SecretKeeper();
		const secret3 = new SecretKeeper();

		await secret1.createSecret();

		await negotiateKeyExchange('a', secret1, 'b', secret2, 'foobar123');
		await negotiateKeyExchange('b', secret2, 'c', secret3, 'another-password');

		const data = encodeUTF8('test');
		const encrypted = (await secret1.encrypt('foo', data)).toBytes();
		const decrypted = await secret3.decrypt('foo', encrypted);
		expect(decrypted).toEqual(data);
	});
});
