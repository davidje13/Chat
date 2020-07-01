import RemoteChamber from './chamber/RemoteChamber';
import EncryptedChamber from './chamber/EncryptedChamber';
import StringChamber from './chamber/StringChamber';
import make from './make';
import './style.css';

const baseURL = process.env.ECHO_HOST; // Set by webpack at build time

const remoteChamber = new RemoteChamber();
const encryptedChamber = new EncryptedChamber(remoteChamber);
const chamber = new StringChamber(encryptedChamber);

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

	function showParticipants() {
		participants.innerText = '';
		if (chamber.myID !== null) {
			participants.appendChild(make('div', {}, [chamber.myID + ' [Me]']));
		}
		for (const p of chamber.participants) {
			participants.appendChild(make('div', {}, [p]));
		}
	}

	function showMessage(sender, message) {
		const atBottom = (messages.scrollTop >= messages.scrollHeight - messages.clientHeight);
		messages.appendChild(buildMessage(sender, message));
		if (atBottom) {
			messages.scrollTop = messages.scrollHeight - messages.clientHeight;
		}
	}

	function sendMessage() {
		const msg = fMessage.value;
		if (chamber.send(msg)) {
			fMessage.value = '';
			showMessage(null, msg);
		}
	}

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

	chamber.addEventListener('open', () => showMessage('info', 'Connected'));
	chamber.addEventListener('close', () => showMessage('info', 'Closed'));
	chamber.addEventListener('previousMessageTruncated', () => showMessage('info', '[clipped]'));
	chamber.addEventListener('error', (e) => showMessage('err', 'ERROR ' + JSON.stringify(e)));
	chamber.addEventListener('message', ({detail: {senderID, data}}) => showMessage(senderID, data));

	chamber.addEventListener('open', showParticipants);
	chamber.participants.addEventListener('change', showParticipants);

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
});
