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
  add( id, item ) {
    if( this.storage.hasOwnProperty(id) )
      return false;
    this.storage[id] = this.constructor.make_sure_timeout_is_date(item);
    this.size++;
    if( this.size%100==0 )
      common.log(3,"the number of items is "+this.size);
    return true;
  }
}

module.exports = Storage;
