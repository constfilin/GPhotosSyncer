'use strict';

const common = require('./common');

class Storage {
  static make_sure_timeout_is_date( p ) {
    if( !(p.timestamp instanceof Date) ) {
      p.timestamp = new Date(p.timestamp);
    }
    return p;
  }
  constructor( storage ) {
    this.storage = storage || {};
    this.size    = 0;
    for( let id in this.storage ) {
      this.storage[id] = this.constructor.make_sure_timeout_is_date(this.storage[id]);
      this.size++;
    }
  }
  add( p ) {
    if( !this.storage.hasOwnProperty(p.id) ) {
      this.storage[p.id] = this.constructor.make_sure_timeout_is_date(p);
      this.size++;
      if( this.size%100==0 ) {
	common.log(3,"the number of items is "+this.size);
      }
    }
  }
  filter( proc ) {
    return Object.values(this.storage).filter( p => proc(p) );
  }
  rehash( proc ) {
    let result = {};
    for( let key in this.storage ) {
      let new_key = proc(this.storage[key]);
      if( !result.hasOwnProperty(new_key) )
	result[new_key] = [];
      result[new_key].push(this.storage[key]);
    };
    return result;
  }
}

module.exports = Storage;
