import RemoteChamber from './chamber/RemoteChamber';
import EncryptedChamber from './chamber/EncryptedChamber';
import MultiplexedChamber from './chamber/MultiplexedChamber';
import FragmentedChamber from './chamber/FragmentedChamber';
import StringChamber from './chamber/StringChamber';
import make from './make';
import './style.css';
import JoinedBuffer from './util/JoinedBuffer';

const baseURL = process.env.ECHO_HOST; // Set by webpack at build time

const remoteChamber = new RemoteChamber();
const encryptedChamber = new EncryptedChamber(remoteChamber);
const baseChamber = encryptedChamber;
const multiplexedChamber = new MultiplexedChamber(baseChamber);
const chatChamber = new StringChamber(new FragmentedChamber(multiplexedChamber.channel(0)));
const avatarChamber = new FragmentedChamber(multiplexedChamber.channel(1));

function buildMessage(sender, message) {
	const o = make('div');
	if (sender === null) {
		o.className = 'message me';
	} else if (sender === 'err') {
		o.className = 'message err';
	} else if (sender === 'info') {
		o.className = 'message info';
	} else {
		o.className = 'message them';
		o.appendChild(make('div', { 'class': 'from' }, [sender]));
	}

	o.appendChild(make('div', { 'class': 'content' }, [message]));
	return o;
}

window.addEventListener('DOMContentLoaded', () => {
	const fChamberName = make('input', { id: 'chamber', type: 'text' });
	const chamberLabel = make('label', { id: 'chamberLabel' }, ['Chamber name: ', fChamberName]);
	const fChamberSwitch = make('button', { id: 'chamberSwitch' }, ['Go']);
	const fChamberPass = make('input', { id: 'chamberPass', type: 'password' });
	const chamberPassLabel = make('label', { id: 'chamberPassLabel' }, ['Password: ', fChamberPass]);
	const chamberSelect = make('div', { id: 'chamberSelect' }, [chamberLabel, fChamberSwitch, chamberPassLabel]);
	const messages = make('div', { id: 'messages' });
	const participants = make('div', { id: 'participants' });
	const fMessage = make('input', { id: 'message', type: 'text' });
	const entry = make('div', { id: 'entry' }, [fMessage]);
	document.body.appendChild(chamberSelect);
	document.body.appendChild(messages);
	document.body.appendChild(participants);
	document.body.appendChild(entry);

	function switchChamber() {
		remoteChamber.setUrl(baseURL + '/' + fChamberName.value);
	}

	let myImage = null;
	const avatars = new Map();

	function showParticipants() {
		participants.innerText = '';
		if (baseChamber.myID !== null) {
			const me = make('div', {}, [baseChamber.myID + ' [Me]']);
			if (myImage) {
				me.appendChild(myImage);
			}
			participants.appendChild(me);
		}
		for (const p of baseChamber.participants) {
			const them = make('div', {}, [p]);
			if (avatars.has(p)) {
				them.appendChild(avatars.get(p));
			}
			participants.appendChild(them);
		}
	}

	function showMessage(sender, message) {
		const atBottom = (messages.scrollTop >= messages.scrollHeight - messages.clientHeight);
		messages.appendChild(buildMessage(sender, message));
		if (atBottom) {
			messages.scrollTop = messages.scrollHeight - messages.clientHeight;
		}
	}

	async function sendMessage() {
		const msg = fMessage.value;
		if (await chatChamber.send(msg)) {
			fMessage.value = '';
			showMessage(null, msg);
		}
	}

	function loadImage(buffer, type) {
		return new Promise((resolve) => {
			const url = URL.createObjectURL(new Blob([buffer], { type }));
			const image = new Image();
			image.addEventListener('load', () => {
				URL.revokeObjectURL(url);
				resolve(image);
			});
			image.src = url;
		});
	}

	async function setAvatar(buffer, type) {
		myImage = await loadImage(buffer, type);
		showParticipants();

		if (await avatarChamber.send(new JoinedBuffer().addDynamic(type).addFixed(buffer))) {
			showMessage('info', 'Updated Avatar');
		}
	}

	avatarChamber.addEventListener('message', async ({detail: {senderID, data}}) => {
		const buffer = new JoinedBuffer(data);
		const type = buffer.readString();
		const imageData = buffer.read(JoinedBuffer.TO_END);
		const newImage = await loadImage(imageData, type);
		avatars.set(senderID, newImage);
		showParticipants();
	});

	const pendingKnocks = new Set();
	const pendingChallenges = new Set();

	encryptedChamber.addEventListener('knock', ({detail: {id}}) => {
		if (!encryptedChamber.isConnected) {
			return;
		}
		if (fChamberPass.value.length >= 8) {
			encryptedChamber.answerKnock(id, fChamberPass.value);
		} else {
			pendingKnocks.add(id);
		}
	});

	encryptedChamber.addEventListener('challenge', ({detail: {id}}) => {
		if (fChamberPass.value.length >= 8) {
			encryptedChamber.answerChallenge(id, fChamberPass.value);
		} else {
			pendingChallenges.add(id);
		}
	});

	fChamberPass.addEventListener('change', () => {
		const pass = fChamberPass.value;

		if (encryptedChamber.isConnected) {
			pendingKnocks.forEach((id) => encryptedChamber.answerKnock(id, pass));
		} else if (pendingChallenges.size > 0) {
			pendingChallenges.forEach((id) => encryptedChamber.answerChallenge(id, pass));
		} else {
			encryptedChamber.knock();
		}
		pendingKnocks.clear();
		pendingChallenges.clear();
	});

	encryptedChamber.addEventListener('challengeFailed', ({detail: {id}}) => {
		alert('password rejected');
	});

	chatChamber.addEventListener('open', () => showMessage('info', 'Connected'));
	chatChamber.addEventListener('close', () => showMessage('info', 'Closed'));
	chatChamber.addEventListener('previousMessageTruncated', () => showMessage('info', '[clipped]'));
	chatChamber.addEventListener('error', (e) => showMessage('err', 'ERROR ' + JSON.stringify(e)));
	chatChamber.addEventListener('message', ({detail: {senderID, data}}) => showMessage(senderID, data));

	baseChamber.addEventListener('open', showParticipants);
	baseChamber.participants.addEventListener('change', showParticipants);

	fChamberName.addEventListener('keyup', (e) => {
		if (e.keyCode === 13) {
			switchChamber();
		}
	});
	fChamberSwitch.addEventListener('click', switchChamber);
	fMessage.addEventListener('keyup', (e) => {
		if (e.keyCode === 13) {
			sendMessage();
		}
	});

	document.body.addEventListener('dragover', (e) => {
		e.preventDefault();
	});
	document.body.addEventListener('drop', (e) => {
		e.preventDefault();
		const {items} = e.dataTransfer;
		for (const item of items) {
			const {kind, type} = item;
			if (kind === 'file' && type.startsWith('image/')) {
				const file = item.getAsFile();

				const reader = new FileReader();
				reader.addEventListener('load', () => setAvatar(reader.result, type));
				reader.readAsArrayBuffer(file);

				break;
			}
		}
	});
});
