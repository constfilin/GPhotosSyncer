#!/usr/bin/nodejs

"use strict";

const fs     = require('fs');

const common  = require('./common');
const GPhotos = require('./GPhotos');
const Files   = require('./Files');

class Action {
    constructor( name, description, needs_files, needs_gphotos, proc, needs_gphotos_login ) {
        this.name                = name;
        this.name_parts          = name.split("=");
        this.description         = description;
        this.needs_files         = needs_files;
        this.needs_gphotos       = needs_gphotos;
        this.proc                = proc;
        this.needs_gphotos_login = needs_gphotos_login;
    }
    call( files, gphotos, arg ) {
        // If the same action is specified many times with different arguments then minimist package converts
        // them to an *array* of argumeents for the action. If the action is specified only once then the 
        // action argument is a String. Normalize this situation by converting everything into an arrray
        ((arg.constructor===Array)?arg:[arg]).forEach( arg => {
            (this.proc.bind(this))(files,gphotos,arg);
        });
    }
}
const _ACTIONS = [
    new Action("\n// Actions on Google Photos"),
    new Action("// Updating cache"),
    new Action("gphotos_cache=mediaId","Add gphoto to cache by its mediaId in Google Photos",false,true,(files,gphotos,id) => { 
        gphotos.load(id).then( (item) => {
            gphotos.cache.add(item);
            console.log("Cached "+item);
        });
    },true),
    new Action("gphotos_uncache=cacheid","Delete cache item by id (but leave gphoto)",false,true,(files,gphotos,id) => {
        let item = gphotos.cache.del(id);
        if( item ) {
            console.log("Uncashed "+item);
        }
        else {
            console.log("Invalid cache id");
        };
    }),
    new Action("gphotos_update=cacheid","Update cache item by id with info from Google Photos",false,true,(files,gphotos,id) => {
        gphotos.updateId(id).then( (item) => {
            console.log("Updated "+item);
        }).catch( (err) => {
            console.log("There was an error ("+err+")");
        });
    },true),
    new Action("gphotos_updateAll","Update cache for ALL gphotos (do 'rm "+common.gphotosCache+"' first!)",false,true,(files,gphotos) => {
        gphotos.read().then( (gphotos) => {
            console.log("Re-read information about "+gphotos.cache.size+" gphotos");
        });
    },true),
    new Action("// Inspecting cache"),
    new Action("gphotos_count","Show the total count of gphotos",false,true,(files,gphotos) => {
        console.log(gphotos.cache.size);
    }),
    new Action("gphotos_countByYear","Show the number of gphotos for each year",false,true,(files,gphotos) => {
        let by_years = gphotos.cache.rehash(i=>i.timestamp.getFullYear(),1);
        console.log(Object.keys(by_years).map(year => (year+": "+by_years[year].length+" gphotos")).join("\n"));
    }),
    new Action("gphotos_get=cacheid","Show a cached gphoto",false,true,(files,gphotos,id) => {
        console.log(gphotos.cache.get(id));
    }),
    new Action("gphotos_grepGPath=pattern","Show gphotos with gphotos_path matching regexp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(gphotos.cache.grep_gpath(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_grepvGPath=pattern","Show gphotos with gphotos_path not matching regexp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(gphotos.cache.grepv_gpath(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_grepEXIFDate=pattern","Show gphotos with EXIF timestamp matching regexp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(gphotos.cache.grep_exifdate(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_grepvEXIFDate=pattern","Show gphotos with EXIF timestamp not matching regexp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(gphotos.cache.grepv_exifdate(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_grepEXIFMismatches=pattern","Show gphotos with EXIF timestamp matching regexp but gphotos_path not corresponding to the timestamp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(gphotos.cache.grep_exifMistmaches(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_deltaEXIFDate=pattern","Show gphotos with EXIF date matching a regexp that are not among the files with EXIF date matching the same regexp",true,true,(files,gphotos,pattern) => {
        let re = new RegExp(pattern,"i");
        let difference = common.get_difference(gphotos.cache.grep_exifdate(re),files.cache.grep_exifdate(re),'gphoto','file');
        if( difference.missing.length ) {
            console.log("Found "+difference.missing.length+" gphotos that are not in files:\n"+
                        "\t"+difference.missing.map(i => "{"+i.id+","+i.gphotos_path+"}").join("\n\t"));
        }
        if( difference.same_gphotos_path.length ) {
            console.log("Found "+difference.same_gphotos_path.length+" cases when a gphoto and a file have the same gphotos_path but different timestamps:\n"+
                        "\t"+difference.same_gphotos_path.map(e=>(e.diff+"h: "+e.gphoto.id+","+e.file.id)).join("\n\t"));
        }
    }),
    new Action("// Other operations"),
    new Action("gphotos_syncEXIFDate=pattern","Download gphotos with EXIF date matching a regexp that are not among the files with EXIF date matching the same regexp",true,true,(files,gphotos,pattern) => { 
        let re = new RegExp(pattern,"i");
        let difference = common.get_difference(gphotos.cache.grep_exifdate(re),files.cache.grep_exifdate(re),'gphoto','file');
        [difference.missing[0]].forEach( (gphoto) => {
            gphotos.download(gphoto).then( (filename) => {
                // TODO:
                // The trouble is that I haven't figured out how to get the original image bytes from GPhotos. What gphotos.download
                // produces is an image body *without* any exifinformation. Therefore when we load the file, we will end up getting
                // a differnt timestamp. I am not sure how to fix it but - perhaps - the fix should be in gphotos.download() method
                files.load(filename).then( (file) => {
                    files.cache.add(file);
                    console.log("Synced '"+gphoto+" to '"+file+"'");
                }).catch( (err) => {
                    console.log("Cannot read file '"+filename+"' ("+err+")");
                });
            }).catch( (err) => {
                console.log("Cannot download photo '"+gphoto+"' to file ("+err+")");
            });
        });
    },true),
    new Action("gphotos_peek=mediaId","Peek at gphoto without adding it to cache",false,true,(files,gphotos,id) => { 
        gphotos.load(id).then( (item) => {
            console.log(item);
        });
    },true),
    new Action("gphotos_updateAlbum=albumId","Update cache for all gphotos in album",false,true,(files,gphotos,id) => {
        gphotos.read(id).then( (gphotos) => {
            console.log("Re-read information about gphotos in album '"+id+"'");
        });
    },true),
    new Action("gphotos_getAlbums","List your gphotos albums",false,true,(files,gphotos) => {
        gphotos.getAlbums().then( (albums) => { 
            console.log(albums);
        });
    },true),
    new Action("\n// Actions on File System"),
    new Action("// Updating cache"),
    new Action("files_cache=filePath","Add a file to cache",true,false,(files,gphotos,id) => {
        files.load(id).then( (item) => {
            files.cache.add(item);
            console.log("Cached "+item);
        });
    }),
    new Action("files_uncache=cacheid","Delete cached file by id (but leave file itself)",true,false,(files,gphotos,id) => {
        let item = files.cache.del(id);
        if( item ) {
            console.log("Uncached "+item);
        }
        else {
            console.log("Invalid cache id");
        };
    }),
    new Action("files_update=cacheid","Update cached file by id with info from File System",true,false,(files,gphotos,id) => {
        files.updateId(id).then( (item) => {
            console.log("Updated "+item);
        }).catch( (err) => {
            console.log("There was an error ("+err+")");
        });
    }),
    new Action("files_updateAll","Update cached information for ALL files  (do 'rm "+common.filesCache+"' first!)",true,false,(files,gphotos) => {
        files.read(common.filesRoot).then( (files) => {
            console.log("Update cache information about "+files.cache.size+" files");
        });
    }),
    new Action("// Inspecting cache"),
    new Action("files_count","Show the total count of files",true,false,(files,gphotos) => {
        console.log(files.cache.size);
    }),
    new Action("files_countByYear","Show the number of files for each year",true,false,(files,gphotos) => {
        let by_years = files.cache.rehash(i=>i.timestamp.getFullYear(),1);
        console.log(Object.keys(by_years).map(year => (year+": "+by_years[year].length+" files")).join("\n"));
    }),
    new Action("files_get=cacheid","Show a cached file",true,false,(files,gphotos,id) => {
        console.log(files.cache.get(id)+"");
    }),
    new Action("files_grepGPath=pattern","Show files with gphotos_path matching regexp",true,false,(files,gphotos,pattern) => {
        let result = files.cache.grep_gpath(new RegExp(pattern,"i"));
        console.log(Object.keys(result).map(k=>k+" => "+result[k].toString()).join("\n"));
    }),
    new Action("files_grepvGPath=pattern","Show files with gphotos_path not matching regexp",true,false,(files,gphotos,pattern) => {
        console.log(Object.values(files.cache.grepv_gpath(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_grepEXIFDate=pattern","Show files with EXIF timestamp matching regexp",true,false,(files,gphotos,pattern) => { 
        console.log(Object.values(files.cache.grep_exifdate(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_grepvEXIFDate=pattern","Show files with EXIF timestamp not matching regexp",true,false,(files,gphotos,pattern) => {
        console.log(Object.values(files.cache.grepv_exifdate(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_grepEXIFMismatches=pattern","Show files with EXIF timestamp matching regexp but gphotos_path not corresponding to the timestamp",false,true,(files,gphotos,pattern) => {
        console.log(Object.values(files.cache.grep_exifMistmaches(new RegExp(pattern,"i"))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_deltaEXIFDate=pattern","Show files with EXIF date matching a regexp that are not among gphotos with EXIF date matching the same regexp",true,true,(files,gphotos,pattern) => {
        let re = new RegExp(pattern,"i");
        let difference = common.get_difference(files.cache.grep_exifdate(re),gphotos.cache.grep_exifdate(re),'file','gphoto');
        if( difference.missing.length ) {
            console.log("Found "+difference.missing.length+" files that are not in gphotos:\n"+
                        "\t"+difference.missing.map(i => "{"+i.id+","+i.gphotos_path+"}").join("\n\t"));
        }
        if( difference.same_gphotos_path.length ) {
            console.log("Found "+difference.same_gphotos_path.length+" cases when a file and a gphoto have the same gphotos_path but different timestamps:\n"+
                        "\t"+difference.same_gphotos_path.map(e=>(e.diff+"h: "+e.file.id+","+e.gphoto.id)).join("\n\t"));
        }
    }),
    new Action("// Other operations"),
    new Action("files_peek=filePath","Peek at file properties without adding it to cache",true,false,(files,gphotos,id) => {
        files.load(id).then( (item) => {
            console.log(item);
        });
    }),
    new Action("files_updateYear=year","Update cache for all files of given year",true,false,function(files,gphotos,year) {
        files.read(common.filesRoot+"/"+year).then( (files) => {
            console.log("Updated cache information about files of year "+year);
        });
    }),
    new Action("files_sync=cachedid_or_filepath","(Re-)upload cached file to GPhotos",true,true,(files,gphotos,id) => {
        let sync = (item)  => {
            gphotos.upload(item).then( (gphoto) => {
                console.log("Uploaded file "+item+" to gphoto "+gphoto);
            }).catch( (err) => {
                console.log("Cannot upload file "+item+" ("+err+")");
            });
        }
        let item = files.cache.get(id);
        if( item ) {
            sync(item);
        }
        else {
            files.load(id).then(item => { sync(item); });
        }
    },true),
    new Action("files_syncEXIFDate=pattern","Upload files with EXIF date matching a regexp that are not among gphotos with EXIF date matching the same regexp",true,true,(files,gphotos,pattern) => {
        let re = new RegExp(pattern,"i");
        let difference = common.get_difference(files.cache.grep_exifdate(re),gphotos.cache.grep_exifdate(re),'file','gphoto');
        if( difference.missing.length ) {
            if( common.get_answer("Found "+difference.missing.length+" files that are not in gphotos:\n"+
                                  "\t"+difference.missing.map(i => "{"+i.id+","+i.gphotos_path+"}").join("\n\t")+"\n"+
                                  "Upload them?","y")=="y" ) {
                Promises.all(difference.missing.map( file => gphotos.upload(file).then( (gphoto) => {
                    console.log("File "+file+" was uploaed to "+gphoto);
                }).catch( (err) => {
                    console.log("Count not upload file "+file+" ("+err+")");
                })));
            }
        }
        if( difference.same_gphotos_path.length ) {
            if( common.get_answer("Found "+difference.same_gphotos_path.length+" cases when a file and a gphoto have the same gphotos_path but different timestamps:\n"+
                                  "\t"+difference.same_gphotos_path.map(e=>(e.diff+"h: "+e.file.id+","+e.gphoto.id)).join("\n\t")+"\n"+
                                  "Replace these gphotos with files?","y")=="y" ) {
                Promise.all(difference.same_gphotos_path.map( (e) => gphotos.upload(e.file).then( (gphoto) => {
                    console.log("File "+e.file+" was uploaded to "+gphoto);
                    return gphotos.removeId(e.gphoto.id).then( (gphoto) => {
                        console.log("GPhotos '"+gphotos+" was removed");
                    }).catch( (err) => {
                        console.log("Cannot remove gphoto '"+e.gphoto.id+"' ("+err+")");
                    });
                }).catch( (err) => {
                    console.log("Could not upload ("+err+")");
                })));
            }
        }
    },true),
    new Action("files_checkTimestampsGPath=pattern","For files with GPath matching regexp, check that file is where it is supposed to be on the file system",true,false,(files,gphotos,pattern) => {
        let re = new RegExp(pattern,"i");
        let changed_files = files.check_exif_timestamps(i=>i.gphotos_path.match(re));
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("files_checkTimestampsEXIFDate=pattern","For files with EXIFDate matching regexp, check that file is where it is supposed to be on the file system",true,false,(files,gphotos,pattern) => {
        let re = new RegExp(pattern,"i");
        let changed_files = files.check_exif_timestamps(i => (Date.toEXIFString(i.timestamp).match(re)));
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("\n// Other"),
    new Action("deltaEXIFDate=pattern","a shortcut for --files_deltaEXIFDate=pattern --gphotos_deltaEXIFDate=pattern",true,true,(files,gphotos,pattern) => {
        _ACTIONS.filter(a => ["files_deltaEXIFDate","gphotos_deltaEXIFDate"].includes(a.name_parts[0])).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(files,gphotos,pattern);
        });
    }),
    new Action("grepEXIFDate=pattern","a shortcut for --files_grepEXIFDate=pattern --gphotos_grepEXIFDate=pattern",true,true,(files,gphotos,pattern) => {
        _ACTIONS.filter(a => ["files_grepEXIFDate","gphotos_grepEXIFDate"].includes(a.name_parts[0])).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(files,gphotos,pattern);
        });
    }),
    new Action("countByYear","for each year show how many files and gphotos it has",true,true,(files,gphotos) => {
        let gphotos_by_years = gphotos.cache.rehash(p => p.timestamp.getFullYear(),1);
        let files_by_years  =  files.cache.rehash(i => i.timestamp.getFullYear(),1);
        Object.keys(gphotos_by_years).reduce( (accumulator,year) => {
            if( !accumulator.includes(year) )
                accumulator.push(year);
            return accumulator;
        },Object.keys(files_by_years)).sort().forEach( year => {
            let gphotos_count = (gphotos_by_years.hasOwnProperty(year) ? gphotos_by_years[year].length:0);
            let files_count  = (files_by_years.hasOwnProperty(year)  ? files_by_years[year].length:0);
            console.log(year+": "+gphotos_count+" gphotos, "+files_count+" files"+((gphotos_count!=files_count)?" <==":""));
        });
    })
];
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
let valid_actions = _ACTIONS.filter( a => common.argv.hasOwnProperty(a.name_parts[0]) && a.proc );
if( valid_actions.length ) {
    let files          = valid_actions.filter(a=>a.needs_files).length   ? new Files()   : undefined;
    let gphotos        = valid_actions.filter(a=>a.needs_gphotos).length ? new GPhotos() : undefined;
    // Handle GPhotos login if necessary
    let glogin_promise = (gphotos && (valid_actions.filter(a=>a.needs_gphotos_login).length>0)) ? gphotos.login() : Promise.resolve(gphotos);
    glogin_promise.then( () => {
        valid_actions.forEach( (a) => {
            try {
                a.call(files,gphotos,common.argv[a.name_parts[0]]);
            }
            catch( err ) {
                console.log(err);
                console.log("Exception from handler of "+a.name+" ("+err+")");
            };
        });
    });
}
else {
    console.log(
        "USAGE: "+process.argv[1]+" [--loglevel=loglevel] --action --action...\n" +
            "--loglevel - defines verbosity.\n" +
            "--action   - describes what we are going to do, one of:\n"+
            _ACTIONS.map( a => "    "+a.name.padEnd(40)+(a.description?" - "+a.description:"") ).join("\n")+"\n"+
            "\n"+
            "If several actions are given on the command line then all of them are executed in the given order\n"+
            "E.G.:\n"+
            "   "+process.argv[1]+" --files_deltaGPhotosYear=1915 --gphotos_deltaFilesYear=1915\n"+
            "Will show the delta between files stored on file system and in GPhotos for year 1915.\n"
    );
}
