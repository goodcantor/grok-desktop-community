import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createTaskNotifier,notificationPreferences} from '../electron/task-notifications.mjs';

function fixture(){
  const shown=[],selected=[];let state={};
  class Notice extends EventEmitter{
    static isSupported(){return true;}
    constructor(options){super();this.options=options;}
    show(){shown.push(this);}
    close(){this.closed=true;this.emit('close');}
  }
  const win=Object.assign(new EventEmitter(),{id:1,focused:false,isDestroyed:()=>false,isFocused(){return this.focused;},isMinimized:()=>true,restore(){this.restored=true;},show(){},focus(){this.focused=true;this.emit('focus');},flashFrame(){}});
  const ws={win,agent:{sessionId:'session-123456789',cwd:'C:\\Projects\\PrivateProject'}};
  return {shown,ws,selected,notifier:createTaskNotifier({Notification:Notice,getState:()=>state,selectExecution:record=>{selected.push(record);record.host.selected=record;}}),setState:value=>{state=value;}};
}
test('background alerts show only meaningful outcomes, contain no content and deduplicate gates',()=>{
  const {shown,ws,notifier}=fixture();
  assert.equal(notifier.show(ws,{kind:'permission',key:'gate'}),true);
  assert.equal(notifier.show(ws,{kind:'permission',key:'gate'}),false);
  assert.equal(shown.length,1);assert.equal(shown[0].options.silent,true);
  assert.equal(shown[0].options.body,'PrivateProject · 23456789 · Grok Desktop Community');
  assert.equal(notifier.show(ws,{kind:'unknown',key:'other'}),false);
  notifier.dismiss(ws,'gate');assert.equal(shown[0].closed,true);
  assert.equal(notifier.show(ws,{kind:'complete',key:'response'}),true);
  shown[1].emit('click');assert.equal(ws.win.focused,true);assert.equal(ws.win.restored,true);assert.equal(shown[1].closed,true);
  assert.equal(notifier.show(ws,{kind:'failed',key:'error'}),false);
});
test('preferences, privacy and stale session clicks are respected',()=>{
  const {shown,ws,notifier,setState}=fixture();
  assert.deepEqual(notificationPreferences(),{enabled:true,sound:false});
  setState({notifications:{enabled:false}});assert.equal(notifier.show(ws,{kind:'answer'}),false);
  setState({privacyMode:true,notifications:{enabled:true,sound:true}});
  notifier.show(ws,{kind:'answer',key:'question'});assert.equal(shown[0].options.silent,false);assert.ok(!shown[0].options.body.includes('PrivateProject'));
  ws.agent.sessionId='different-session';shown[0].emit('click');assert.equal(ws.win.focused,false);
  assert.equal(notifier.show(ws,{kind:'complete',sessionId:'old-session'}),false);
});

test('inactive-chat notification uses canonical selection and window focus dismisses the selected chat only',()=>{
 const {shown,ws,selected,notifier}=fixture(),sent=[];
 ws.win.webContents={send:(...args)=>sent.push(args)};
 const host={selected:ws};ws.host=host;ws.lastCwd='project';
 const other={...ws,agent:{...ws.agent,sessionId:'session-other'}};
 notifier.show(ws,{kind:'complete'});notifier.show(other,{kind:'answer'});
 ws.win.focus();assert.equal(shown[0].closed,true);assert.equal(shown[1].closed,undefined);
 shown[1].emit('click');assert.deepEqual(selected,[other]);assert.equal(host.selected,other);
 assert.deepEqual(sent,[['app:select-execution',{cwd:'project',sessionId:'session-other'}]]);
 ws.win.focused=false;notifier.show(ws,{kind:'failed'});notifier.show(other,{kind:'failed'});
 ws.win.emit('closed');assert.equal(shown[2].closed,true);assert.equal(shown[3].closed,true);
});
