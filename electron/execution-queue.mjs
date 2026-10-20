import { interjectRpcFollowUp } from '../shared/prompt-delivery.mjs';
/** One queue per native chat. Main owns admission and draining, independent of React. */
export class ExecutionQueue {
  constructor({ deliver, interject, cancel, persist = () => {}, changed = () => {}, initial = [] }) {
    Object.assign(this, { deliver, interject, cancel, persist, changed });
    const restored = Array.isArray(initial) ? { pending: initial } : (initial?.version === 2 ? initial : {});
    this.items = Array.isArray(restored.pending) ? restored.pending : [];
    if(restored.inFlight && restored.failed && restored.failed.id!==restored.inFlight.id)this.items.unshift({...restored.failed,deliveryUncertain:true});
    this.inFlight = null;
    this.steering = false;
    this.paused = true;
    this.running = false;
    this.disposed = false;
    this.revision = 0;
    this.outcome = null;
    this.failed = restored.inFlight ? { ...restored.inFlight, interrupted: true, error: 'Delivery interrupted. Check native history before retrying; this message was not replayed.' } : (restored.failed || null);
  }
  snapshot() {
    return { items: this.items, paused: this.paused, running: this.running, revision: this.revision, outcome: this.outcome, failed: this.failed };
  }
  publish() { this.revision++; this.changed(this.snapshot()); }
  save(next = this.items, inFlight = this.inFlight, failed = this.failed) {
    // Persist before acknowledging a queue mutation. A failed save never drops an item.
    if(failed && this.failed && failed.id!==this.failed.id && !next.some(row=>row.id===this.failed.id))next=[{...this.failed,deliveryUncertain:true},...next];
    this.persist({ version: 2, pending: next, inFlight, failed });
    this.items = next;
    this.inFlight = inFlight;
    this.failed = failed;
    this.publish();
  }
  async submit(item, mode = 'auto') {
    if (this.disposed) throw Error('Chat closed');
    if (!item || typeof item.id !== 'string' || !item.id || !Array.isArray(item.images) || typeof item.text !== 'string' || (!item.text.trim() && !item.images?.length)) throw Error('Empty message');
    if((this.running&&this.inFlight?.id===item.id)||this.items.some(row=>row.id===item.id))return this.snapshot();
    if (this.running && mode === 'interject') {
      if (this.steering) throw Error('A steering message is already being delivered');
      // A crash while steering leaves a visibly uncertain, paused entry.
      const uncertain = { ...item, deliveryUncertain: true };
      this.save([...this.items, uncertain]);
      this.steering = true;
      try {
        const result = await this.interject(item);
        const follow = interjectRpcFollowUp(result);
        if (follow === 'error') throw Error(result?.error || 'Could not steer this task');
        this.save(follow === 'queue' ? this.items.map(row => row.id === item.id ? item : row) : this.items.filter(row => row.id !== item.id));
      } catch (error) {
        this.paused = true;
        this.save(this.items.filter(row => row.id !== item.id), this.inFlight, { ...item, interrupted: true, error: String(error) });
      } finally { this.steering = false; this.drain(); }
      return this.snapshot();
    }
    if (this.running) {
      this.save(mode === 'now' ? [item, ...this.items] : [...this.items, item]);
      if (mode === 'now') { this.paused = false; this.sendAfterStop=true; this.cancel(); }
      return this.snapshot();
    }
    if(!this.items.length)this.paused=false;
    this.save(this.items, item);
    void this.run(item);
    return this.snapshot();
  }
  async run(item) {
    if (this.running || this.disposed) return;
    this.running = true;
    const startedAt = Date.now();
    this.outcome = null;
    this.publish();
    try {
      const reply = await this.deliver(item);
      const stopped = reply?.stopReason === 'cancelled';
      this.outcome = { startedAt, endedAt: Date.now(), status: stopped ? 'stopped' : 'completed' };
      if (stopped && !this.sendAfterStop) this.paused = true;
      this.sendAfterStop=false;
      this.save(this.items, null, this.failed);
    } catch (error) {
      const cancelled=/cancel/i.test(error?.message||String(error));
      this.paused = !(cancelled&&this.sendAfterStop);
      this.sendAfterStop=false;
      const failure = { ...item, error: error?.message || String(error) };
      const previousFailure=this.failed;
      this.outcome = { startedAt, endedAt: Date.now(), status: /cancel/i.test(failure.error) ? 'stopped' : 'failed' };
      try { this.save(this.items, null, failure); } catch { this.failed=previousFailure || failure; /* Existing in-flight disk record remains recoverable. */ }
    } finally {
      this.running = false;
      this.publish();
      if (!this.paused && !this.disposed) this.drain();
    }
  }
  drain() {
    if (this.running || this.steering || this.paused || this.disposed || !this.items.length) return;
    const item = this.items[0];
    if(item.deliveryUncertain){this.paused=true;this.publish();return;}
    try { this.save(this.items.slice(1), item); } catch (error) { this.paused = true; this.failed = { ...item, error: String(error) }; this.publish(); return; }
    void this.run(item);
  }
  update({ action, id, text, direction, paused }) {
    if (this.disposed) throw Error('Chat closed');
    if (action === 'pause') { this.paused = Boolean(paused); this.publish(); this.drain(); }
    else if (action === 'remove') this.save(this.items.filter(item => item.id !== id));
    else if (action === 'edit') {
      if (typeof text !== 'string' || !text.trim()) throw Error('Empty message');
      this.paused = true;
      this.save(this.items.map(item => item.id === id ? { ...item, text: text.trim(), timelineText: undefined } : item));
    } else if (action === 'move') {
      if(![-1,1].includes(Number(direction)))throw Error('Invalid queue direction');
      const next = [...this.items], from = next.findIndex(item => item.id === id), to = from + Number(direction);
      if (from >= 0 && to >= 0 && to < next.length) { [next[from], next[to]] = [next[to], next[from]]; this.save(next); }
    } else if (action === 'send') {
      const item=this.items.find(row=>row.id===id);
      if(item){this.save(this.items.filter(row=>row.id!==id),this.running?this.inFlight:item);void this.submit({...item,deliveryUncertain:false},this.running?'interject':'auto').catch(error=>{this.failed={...item,error:String(error)};this.paused=true;this.publish();});}
    } else if (action === 'clear-failure') { this.save(this.items, this.inFlight, null); }
    else throw Error('Unknown queue action');
    return this.snapshot();
  }
  stop() { this.sendAfterStop=false; this.paused = true; this.publish(); this.cancel(); }
  dispose() { this.disposed = true; this.paused = true; this.cancel(); }
}
