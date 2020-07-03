import {
	SecretKeeper,
	ChallengeIssuer,
	ChallengeResponder,
} from '../util/encryption';
import { encodeUTF8, decodeUTF8 } from '../util/utf8';
import { forwardEvent } from '../util/event';
import JoinedBuffer from '../util/JoinedBuffer';
import EventSet from '../util/EventSet';

export default class EncryptedChamber extends EventTarget {
	constructor(delegate) {
		super();

		this._secretKeeper = new SecretKeeper();
		this._participants = new EventSet();
		this._challengesIssued = new Map();
		this._challengesReceived = new Map();
		this._ready = false;

		const forward = forwardEvent(this);

		this._delegate = delegate;
		delegate.addEventListener('open', this._open.bind(this));
		delegate.participants.addEventListener('delete', this._bye.bind(this));
		delegate.participants.addEventListener('clear', this._clear.bind(this));
		delegate.addEventListener('message', this._message.bind(this));
		//delegate.addEventListener('previousMessageTruncated', forward);
		delegate.addEventListener('close', forward);
		delegate.addEventListener('error', forward);
	}

	get isConnected() {
		return this._delegate.isConnected && this._ready;
	}

	get myID() {
		return this._delegate.myID;
	}

	get participants() {
		return this._participants;
	}

	_sendKeyed(recipients, key, ...data) {
		return this._delegate.send(
			new JoinedBuffer(Uint8Array.of(key), ...data),
			recipients,
		);
	}

	_open({detail}) {
		if (!detail.participants.size) {
			this._secretKeeper.createSecret().then(() => {
				this._ready = true;
				this.dispatchEvent(new CustomEvent('open', { detail: {
					...detail,
					participants: this._participants,
				} }));
			});
		} else {
			this.knock();
		}
	}

	knock(recipients) {
		if (this._secretKeeper.canDecrypt()) {
			return;
		}
		this._sendKeyed(recipients, 0);
	}

	_handleKnock(data, {senderID}) {
		if (!this._secretKeeper.canDecrypt() || this._delegate.myID === senderID) {
			return;
		}
		this.dispatchEvent(new CustomEvent('knock', { detail: { id: senderID } }));
	}

	answerKnock(id, password) {
		if (!this._secretKeeper.canDecrypt()) {
			return false;
		}
		if (!this._delegate.participants.has(id) || this._participants.has(id)) {
			return false;
		}
		const issuer = new ChallengeIssuer(password);
		this._challengesIssued.set(id, issuer);
		issuer.issue()
			.then((challenge) => this._sendKeyed({ recipients: [id] }, 1, challenge));
		return true;
	}

	async _handleChallengeIssue(data, {senderID}) {
		if (this._secretKeeper.canDecrypt() || this._delegate.myID === senderID) {
			return; // already have access - ignore challenge
		}
		const responder = new ChallengeResponder();
		this._challengesReceived.set(senderID, responder);
		await responder.handleIssue(data);
		this.dispatchEvent(new CustomEvent('challenge', { detail: {
			id: senderID,
		} }));
	}

	answerChallenge(id, password) {
		const responder = this._challengesReceived.get(id);
		if (!responder) {
			return false;
		}
		responder.answer(this._delegate.myID, password)
			.then((reply) => this._sendKeyed({ recipients: [id] }, 2, reply));
		return true;
	}

	async _handleChallengeAnswer(data, {senderID}) {
		const issuer = this._challengesIssued.get(senderID);
		if (!issuer) {
			return;
		}
		this._challengesIssued.delete(senderID); // prevent multiple answers
		const wrappingKey = await issuer.handleAnswer(senderID, data);
		if (wrappingKey) {
			const wrappedSecret = await this._secretKeeper.wrap(this._delegate.myID, wrappingKey);
			const encryptedParticipants = await this._encrypt(encodeUTF8([...this.participants].join(':')));
			const encryptedWelcome = await this._encrypt(encodeUTF8(senderID));
			this._sendKeyed(
				{ recipients: [senderID] },
				3,
				new JoinedBuffer()
					.addDynamic(wrappedSecret)
					.addFixed(encryptedParticipants)
			);
			this._sendKeyed({}, 4, encryptedWelcome);
			this._participants.add(senderID);
		} else {
			this._sendKeyed({ recipients: [senderID] }, 3);
		}
	}

	async _handleChallengeResult(data, {senderID}) {
		const responder = this._challengesReceived.get(senderID);
		if (!responder) {
			return;
		}
		this._challengesReceived.delete(senderID); // expect no more messages

		if (data.length === 0) {
			this.dispatchEvent(new CustomEvent('challengeFailed', { detail: {
				id: senderID,
			} }));
		} else {
			const [wrappedSecret, encryptedParticipants] = new JoinedBuffer(data).split(JoinedBuffer.DYNAMIC);
			await this._secretKeeper.unwrap(
				senderID,
				wrappedSecret,
				responder.getUnwrappingKey()
			);
			this._challengesReceived.clear();
			const participants = decodeUTF8(await this._secretKeeper.decrypt(senderID, encryptedParticipants)).split(':');
			const toAdd = new Set([senderID, ...participants]);
			toAdd.delete(this._delegate.myID);
			this._participants.addAll(toAdd);
			this._ready = true;
			this.dispatchEvent(new CustomEvent('open', { detail: {
				id: this._delegate.myID,
				participants: this._participants,
			} }));
		}
	}

	async _handleEncryptedMessage(data, detail) {
		if (!this._secretKeeper.canDecrypt()) {
			return;
		}
		const decrypted = await this._secretKeeper.decrypt(detail.senderID, data);
		this.dispatchEvent(new CustomEvent('message', { detail: {
			...detail,
			data: decrypted,
		} }));
	}

	async _handleWelcome(data, {senderID}) {
		if (!this._secretKeeper.canDecrypt() || !this._participants.has(senderID)) {
			return;
		}
		const decrypted = await this._secretKeeper.decrypt(senderID, data);
		const newID = decodeUTF8(decrypted);
		if (newID !== this._delegate.myID) {
			this._participants.add(newID);
			this._challengesIssued.delete(newID);
		}
	}

	_message({detail}) {
		const type = detail.data[0];
		const data = detail.data.subarray(1);
		switch (type) {
			case 0: return this._handleKnock(data, detail);
			case 1: return this._handleChallengeIssue(data, detail);
			case 2: return this._handleChallengeAnswer(data, detail);
			case 3: return this._handleChallengeResult(data, detail);
			case 4: return this._handleWelcome(data, detail);
			case 255: return this._handleEncryptedMessage(data, detail);
		}
	}

	_bye({detail: {value}}) {
		this._challengesIssued.delete(value);
		this._challengesReceived.delete(value);
		this._participants.delete(value);
	}

	_clear() {
		this._challengesIssued.clear();
		this._challengesReceived.clear();
		this._participants.clear();
	}

	_encrypt(msg) {
		return this._secretKeeper.encrypt(this._delegate.myID, msg);
	}

	async send(msg, recipients) {
		const bytes = new JoinedBuffer(msg).toBytes();
		return this._sendKeyed(recipients, 255, await this._encrypt(bytes));
	}
}
