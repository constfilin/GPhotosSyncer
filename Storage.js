'use strict';

const common = require('./common');

class Storage {
    static make_sure_timeout_is_date( p ) {
        if( !(p.timestamp instanceof Date) ) {
            p.timestamp = new Date(p.timestamp);
        }
        return p;
    }
    constructor( storage_file ) {
        // If a filename was passed then we want to initialize by reading this JSON file
        this.storage = storage_file ? require(storage_file) : {};
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
    del( id ) {
        if( !this.storage.hasOwnProperty(id) )
            return false;
        delete this.storage[id];
        this.size--;
        if( this.size%100==0 )
            common.log(3,"the number of items is "+this.size);
        return true;
    }
    toArray() {
        return Object.values(this.storage);
    }
    rehash( hasher, put_same_keys_in_array ) {
        return Object.rehash(this.storage,hasher,put_same_keys_in_array);
    }
    map( mapper ) {
        return Object.map(this.storage,mapper);
    }
    filter( predicate ) {
        return Object.filter(this.storage,predicate);
    }
}

module.exports = Storage;
