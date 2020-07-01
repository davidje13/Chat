export default class EventSet extends EventTarget {
	constructor() {
		super();

		this._set = new Set();
	}

	get size() {
		return this._set.size;
	}

	has(item) {
		return this._set.has(item);
	}

	forEach(fn) {
		return this._set.forEach(fn);
	}

	[Symbol.iterator]() {
		return this._set[Symbol.iterator]();
	}

	add(item) {
		if (!this._set.has(item)) {
			this._set.add(item);
			this.dispatchEvent(new CustomEvent('add', { detail: item }));
			this.dispatchEvent(new CustomEvent('change'));
		}
		return this;
	}

	addAll(items) {
		let changed = false;
		for (const item of items) {
			if (!this._set.has(item)) {
				changed = true;
				this._set.add(item);
				this.dispatchEvent(new CustomEvent('add', { detail: item }));
			}
		}
		if (changed) {
			this.dispatchEvent(new CustomEvent('change'));
		}
		return changed;
	}

	delete(item) {
		if (!this._set.delete(item)) {
			return false;
		}
		this.dispatchEvent(new CustomEvent('delete', { detail: item }));
		this.dispatchEvent(new CustomEvent('change'));
		return true;
	}

	deleteAll(items) {
		let changed = false;
		for (const item of items) {
			if (this._set.delete(item)) {
				changed = true;
				this.dispatchEvent(new CustomEvent('delete', { detail: item }));
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
