import { describe, it, expect } from '../framework';
import {
	SecretKeeper,
	ChallengeIssuer,
	ChallengeResponder,
} from '../../src/util/encryption';
import { encodeUTF8 } from '../../src/util/buffer';

describe('SecretKeeper', () => {
	it('encrypts and decrypts data', async () => {
		const secretKeeper = new SecretKeeper();
		await secretKeeper.createSecret();

		const data = encodeUTF8('test');
		const encrypted = await secretKeeper.encrypt('foo', data);
		const decrypted = await secretKeeper.decrypt('foo', encrypted);
		expect(decrypted).toEqual(data);
	});

	it('validates ID integrity', async () => {
		const secretKeeper = new SecretKeeper();
		await secretKeeper.createSecret();

		const data = encodeUTF8('test');
		const encrypted = await secretKeeper.encrypt('foo', data);
		await expect(secretKeeper.decrypt('nope', encrypted)).toReject();
	});

	it('validates key integrity', async () => {
		const secretKeeper = new SecretKeeper();
		const secretKeeper2 = new SecretKeeper();
		await secretKeeper.createSecret();
		await secretKeeper2.createSecret();

		const data = encodeUTF8('test');
		const encrypted = await secretKeeper.encrypt('foo', data);
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

		const wire1 = await issuer.issue();

		const responderSecret = new SecretKeeper();
		const responder = new ChallengeResponder();
		await responder.handleIssue(wire1);
		const wire2 = await responder.answer(id, password);

		const wrappingKey = await issuer.handleAnswer(id, wire2);
		expect(wrappingKey).toBeTruthy();
		const wire3 = await issuerSecret.wrap('abc', wrappingKey);

		const unwrappingKey = responder.getUnwrappingKey();
		expect(unwrappingKey).toBeTruthy();
		await responderSecret.unwrap('abc', wire3, unwrappingKey);

		const data = encodeUTF8('test');
		const encrypted = await issuerSecret.encrypt('foo', data);
		const decrypted = await responderSecret.decrypt('foo', encrypted);
		expect(decrypted).toEqual(data);
	});

	it('returns no wrapping key if the password is wrong', async () => {
		const password = 'my-pass';
		const id = 'me';
		const issuer = new ChallengeIssuer(password);
		const responder = new ChallengeResponder();

		const d1 = await issuer.issue();
		await responder.handleIssue(d1);
		const d2 = await responder.answer(id, 'wrong-password');
		const wrappingKey = await issuer.handleAnswer(id, d2);
		expect(wrappingKey).toEqual(null);
	});
});
