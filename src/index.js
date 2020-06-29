import ChamberManager from './ChamberManager';
import './style.css';

const baseURL = process.env.ECHO_HOST; // Set by webpack at build time
const cm = new ChamberManager();

function buildMessage(sender, message) {
	const o = document.createElement('div');
	if (sender === null) {
		o.className = 'message me';
	} else if (sender === 'err') {
		o.className = 'message err';
	} else if (sender === 'info') {
		o.className = 'message info';
	} else {
		o.className = 'message them';
		const lbl = document.createElement('div');
		lbl.className = 'from';
		lbl.appendChild(document.createTextNode(sender));
		o.appendChild(lbl);
	}
	const msg = document.createElement('div');
	msg.className = 'content';
	msg.innerText = message;

	o.appendChild(msg);
	return o;
}

function make(type, attrs = {}, children = []) {
	const o = document.createElement(type);
	Object.keys(attrs).forEach((key) => {
		o.setAttribute(key, attrs[key]);
	});
	children.forEach((c) => {
		if (typeof c === 'string') {
			o.appendChild(document.createTextNode(c));
		} else {
			o.appendChild(c);
		}
	});
	return o;
}

window.addEventListener('DOMContentLoaded', () => {
	const fChamberName = make('input', { id: 'chamber', type: 'text' });
	const chamberLabel = make('label', { id: 'chamberLabel' }, ['Chamber name: ', fChamberName]);
	const fChamberSwitch = make('button', { id: 'chamberSwitch' }, ['Go']);
	const chamberSelect = make('div', { id: 'chamberSelect' }, [chamberLabel, fChamberSwitch]);
	const messages = make('div', { id: 'messages' });
	const participants = make('div', { id: 'participants' });
	const fMessage = make('input', { id: 'message', type: 'text' });
	const entry = make('div', { id: 'entry' }, [fMessage]);
	document.body.appendChild(chamberSelect);
	document.body.appendChild(messages);
	document.body.appendChild(participants);
	document.body.appendChild(entry);

	function showMessage(sender, message) {
		const atBottom = (messages.scrollTop >= messages.scrollHeight - messages.clientHeight);
		messages.appendChild(buildMessage(sender, message));
		if (atBottom) {
			messages.scrollTop = messages.scrollHeight - messages.clientHeight;
		}
	}

	cm.setMessageCallback(showMessage);

	cm.setParticipantCallback((myID, ps) => {
		participants.innerText = '';
		if (myID !== null) {
			const o = document.createElement('div');
			o.appendChild(document.createTextNode(myID + ' [Me]'));
			participants.appendChild(o);
		}
		for (const p of ps) {
			const o = document.createElement('div');
			o.appendChild(document.createTextNode(p));
			participants.appendChild(o);
		}
	});

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

	function switchChamber() {
		cm.setUrl(baseURL + '/' + fChamberName.value);
	}

	function sendMessage() {
		const headers = []; // TODO: UI for specifying this
		const msg = fMessage.value;
		if (cm.send(headers.join(':') + '\n' + msg)) {
			fMessage.value = '';
			showMessage(null, msg);
		}
	}
});
