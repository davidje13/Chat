// crypto.subtle is not supported by NodeJS and it's a pain to make
// browser testing frameworks run in the browser (Jest/Jasmine),
// so just define a minimal testing harness here:

const scope = [];
let total = 0;
let failures = 0;
let running = 0;

class AssertError extends Error {
	constructor(msg) {
		super(msg);
	}
}

function print(err, msg, e) {
	const target = err ? console.error : console.log;
	e ? target(msg, e) : target(msg);
	if (typeof window !== 'undefined') {
		const ln = document.createElement('div');
		ln.style.fontFamily = 'monospace';
		ln.style.whiteSpace = 'pre';
		ln.innerText = e ? `${msg}: ${e.toString()}` : msg;
		window.document.body.appendChild(ln);
	}
}

export const describe = (name, fn) => {
	scope.push(name);
	try {
		fn();
	} catch (e) {
		print(true, `ERROR in describe ${scope.join(' : ')}`, e);
	} finally {
		scope.pop();
	}
};

export const it = async (name, fn) => {
	const myScope = scope.slice();
	myScope.push(name);
	++ total;
	++ running;
	try {
		await fn();
		print(false, `PASS ${myScope.join(' : ')}`);
	} catch (e) {
		++ failures;
		print(true, `FAIL ${myScope.join(' : ')}`, e);
	} finally {
		-- running;
		if (running === 0) {
			print(false, 'DONE');
			print(false, `  total: ${total}`);
			print(false, `  failures: ${failures}`);
		}
	}
};

export const expect = (actual) => {
	return {
		toEqual(expected) {
			if (expected instanceof Uint8Array) {
				if (!(actual instanceof Uint8Array)) {
					throw new AssertError(`Expected Uint8Array but got ${actual}`);
				}
				if (actual.length !== expected.length) {
					throw new AssertError(`Expected ${expected} but got ${actual}`);
				}
				for (let i = 0; i < expect.length; ++ i) {
					if (actual[i] !== expected[i]) {
						throw new AssertError(`Expected ${expected} but got ${actual}`);
					}
				}
				return;
			}
			if (expected !== actual) {
				throw new AssertError(`Expected ${expected} but got ${actual}`);
			}
		},
		async toReject() {
			try {
				await actual;
				throw new AssertError('Expected rejection but was not rejected');
			} catch (e) {
			}
		},
		toBeTruthy() {
			if (!actual) {
				throw new AssertError(`Expected ${actual} to be truthy`);
			}
		},
	};
};
