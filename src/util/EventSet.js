export default class EventSet extends EventTarget {
	constructor() {
		super();

		this._set = new Set();
	}

	get size() {
		return this._set.size;
	}

	has(value) {
		return this._set.has(value);
	}

	forEach(fn) {
		return this._set.forEach(fn);
	}

	[Symbol.iterator]() {
		return this._set[Symbol.iterator]();
	}

	add(value) {
		if (!this._set.has(value)) {
			this._set.add(value);
			this.dispatchEvent(new CustomEvent('add', { detail: { value } }));
			this.dispatchEvent(new CustomEvent('change'));
		}
		return this;
	}

	addAll(values) {
		let changed = false;
		for (const value of values) {
			if (!this._set.has(value)) {
				changed = true;
				this._set.add(value);
				this.dispatchEvent(new CustomEvent('add', { detail: { value } }));
			}
		}
		if (changed) {
			this.dispatchEvent(new CustomEvent('change'));
		}
		return changed;
	}

	delete(value) {
		if (!this._set.delete(value)) {
			return false;
		}
		this.dispatchEvent(new CustomEvent('delete', { detail: { value } }));
		this.dispatchEvent(new CustomEvent('change'));
		return true;
	}

	deleteAll(values) {
		let changed = false;
		for (const value of values) {
			if (this._set.delete(value)) {
				changed = true;
				this.dispatchEvent(new CustomEvent('delete', { detail: { value } }));
			}
		}
		if (changed) {
			this.dispatchEvent(new CustomEvent('change'));
		}
		return changed;
	}

	clear() {
		if (this._set.size) {
			this._set.clear();
			this.dispatchEvent(new CustomEvent('clear'));
			this.dispatchEvent(new CustomEvent('change'));
		}
	}
}
