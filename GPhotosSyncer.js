#!/usr/bin/nodejs

"use strict";

const fs     = require('fs');

const common  = require('./common');
const GPhotos = require('./GPhotos');
const Files   = require('./Files');

class Action {
    constructor( name, description, needs_files, needs_gphotos, proc ) {
        this.name          = name;
        this.name_parts    = name.split("=");
        this.description   = description;
        this.needs_files   = needs_files;
        this.needs_gphotos = needs_gphotos;
        this.proc          = proc;
    }
    call( files, gphotos, arg ) {
        // If the same action is specified many times with different arguments then minimist package converts
        // them to an *array* of argumeents for the action. If the action is specified only once then the 
        // action argument is a String. Normalize this situation by converting everything into an arrray
        ((arg.constructor===Array)?arg:[arg]).forEach( arg => {
            // Convert numeric args to numbers 
            let n = Number(arg);
            (this.proc.bind(this))(files,gphotos,Number.isNaN(n)?arg:n);
        });
    }
}
const _ACTIONS = [
    new Action("\n// Actions on Google Photos"),
    new Action("// Updating cache"),
    new Action("gphotos_cache=mediaId","Add gphoto to cache by its mediaId in Google Photos",false,true,function(files,gphotos,id) { 
        gphotos.load(id).then( (item) => {
            if( gphotos.cache.get(item.id) ) {
                gphotos.cache.update(item);
                console.log("Updated file "+item);
            }
            else {
                gphotos.cache.add(item);
                console.log("Added file "+item);
            }
        });
    }),
    new Action("gphotos_uncache=cacheid","Delete cache item by id (but leave gphoto)",false,true,function(files,gphotos,id) {
        let item = gphotos.cache.del(id);
        if( item ) {
            console.log("Uncashed "+item);
        }
        else {
            console.log("Invalid cache id");
        };
    }),
    new Action("gphotos_update=cacheid","Update cache item by id with info from Google Photos",false,true,function(files,gphotos,id) {
        gphotos.updateId(id).then( (item) => {
            console.log("Updated "+item);
        }).catch( (err) => {
            console.log("There was an error ("+err+")");
        });
    }),
    new Action("gphotos_updateAll","Update cache for ALL gphotos (do 'rm "+common.gphotosCache+"' first!)",false,true,function(files,gphotos) {
        gphotos.read().then( (gphotos) => {
            console.log("Re-read information about "+gphotos.cache.size+" gphotos");
        });
    }),
    new Action("// Inspecting cache"),
    new Action("gphotos_count","Show the total count of gphotos",false,true,function(files,gphotos) {
        console.log(gphotos.cache.size);
    }),
    new Action("gphotos_countByYear","Show the number of gphotos for each year",false,true,function(files,gphotos) {
        let by_years = gphotos.cache.rehash(i=>i.timestamp.getFullYear(),1);
        console.log(Object.keys(by_years).map(year => (year+": "+by_years[year].length+" gphotos")).join("\n"));
    }),
    new Action("gphotos_get=cacheid","Show a cached gphoto",false,true,(files,gphotos,id) => {
        console.log(gphotos.cache.get(id));
    }),
    new Action("gphotos_grepGPath=pattern","Show gphotos with gphotos_path matching given regexp pattern",false,true,function(files,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        console.log(Object.values(gphotos.cache.filter(i=>(!i.gphotos_path||i.gphotos_path.match(re)))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_ungrepGPath=pattern","Show gphotos with gphotos_path not matching given regexp pattern",false,true,function(files,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        console.log(Object.values(gphotos.cache.filter(i=>(!i.gphotos_path||(p.gphotos_path.match(re)==null)))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_showYear=year","Show gphotos timestamped to given year",false,true,function(files,gphotos,year) {
        console.log(Object.values(gphotos.cache.filter(i=>i.timestamp.getFullYear()==year)).map(i=>i.toString()));
    }),
    new Action("gphotos_mismatchingYear=year","Show gphotos timestamped to given year and with gphotos_path mismatching the year",false,true,function(files,gphotos,year) {
        let re = new RegExp("^"+year+"_.+","i");
        console.log(Object.values(gphotos.cache.filter(i=>(i.timestamp.getFullYear()==year) && (i.gphotos_path.match(re)==null))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_mismatchingYears","Show all gphotos where gphotos_path mismatches the gphoto timestamp",false,true,function(files,gphotos) {
        console.log(Object.values(gphotos.cache.filter(i=>(!i.gphotos_path||i.gphotos_path.indexOf(i.timestamp.getFullYear()+"_")!=0))).map(i=>i.toString()).join("\n"));
    }),
    new Action("gphotos_minusFilesYear=year","Show gphotos that are not among files for given year",true,true,function(files,gphotos,year) {
        let difference = common.get_difference(
            gphotos.cache.filter(p=>(p.timestamp.getFullYear()==year)),
            files.cache.filter (i=>(i.timestamp.getFullYear()==year)),
            'gphoto',
            'file');
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
    new Action("gphotos_peek=mediaId","Peek at gphoto without adding it to cache",false,true,function(files,gphotos,id) { 
        gphotos.load(id).then( (item) => {
            console.log(item);
        });
    }),
    new Action("gphotos_updateAlbum=albumId","Update cache for all gphotos in album",false,true,function(files,gphotos,id) {
        gphotos.read(id).then( (gphotos) => {
            console.log("Re-read information about gphotos in album '"+id+"'");
        });
    }),
    new Action("gphotos_getAlbums","List your gphotos albums",false,true,function(files,gphotos) {
        gphotos.getAlbums().then( (albums) => { 
            console.log(albums);
        });
    }),
    new Action("\n// Actions on File System"),
    new Action("// Updating cache"),
    new Action("files_cache=filePath","Add a file to cache",true,false,function(files,gphotos,id) {
        files.load(id).then( (item) => {
            if( files.cache.get(item.id) ) {
                files.cache.update(item);
                console.log("Updated file "+item);
            }
            else {
                files.cache.add(item);
                console.log("Added file "+item);
            }
        });
    }),
    new Action("files_uncache=cacheid","Delete cached file by id (but leave file itself)",true,false,function(files,gphotos,id) {
        let item = files.cache.del(id);
        if( item ) {
            console.log("Uncached "+item);
        }
        else {
            console.log("Invalid cache id");
        };
    }),
    new Action("files_update=cacheid","Update cache item by id with info from File System",true,false,function(files,gphotos,id) {
        files.updateId(id).then( (item) => {
            console.log("Updated "+item);
        }).catch( (err) => {
            console.log("There was an error ("+err+")");
        });
    }),
    new Action("files_updateAll","Update cached information for ALL files  (do 'rm "+common.filesCache+"' first!)",true,false,function(files,gphotos) {
        files.read(common.filesRoot).then( (files) => {
            console.log("Update cache information about "+files.cache.size+" files");
        });
    }),
    new Action("// Inspecting cache"),
    new Action("files_count","Show the total count of files",true,false,function(files,gphotos) {
        console.log(files.cache.size);
    }),
    new Action("files_countByYear","Show the number of files for each year",true,false,function(files,gphotos) {
        let by_years = files.cache.rehash(i=>i.timestamp.getFullYear(),1);
        console.log(Object.keys(by_years).map(year => (year+": "+by_years[year].length+" files")).join("\n"));
    }),
    new Action("files_get=cacheid","Show a cached file",true,false,(files,gphotos,id) => {
        console.log(files.cache.get(id)+"");
    }),
    new Action("files_showYear=year","Show files timestamped to given year",true,false,function(files,gphotos,year) {
        console.log(Object.values(files.cache.filter(i=>i.timestamp.getFullYear()==year )).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_grepGPath=pattern","Show files with gphotos_path matching given regexp pattern",true,false,function(files,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        console.log(Object.values(files.cache.filter(i=>(!i.gphotos_path||i.gphotos_path.match(re)))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_ungrepGPath=pattern","Show files with gphotos_path not matching given regexp pattern",true,false,function(files,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        console.log(Object.values(files.cache.filter(i=>(!i.gphotos_path||(i.gphotos_path.match(re)==null)))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_mismatchingYear=year","Show files timestamped to given year and with gphotos_path mismatching the year",true,false,function(files,gphotos,year) { 
        let re = new RegExp("^"+year+"_.+","i");
        console.log(Object.values(files.cache.filter(i=>(i.timestamp.getFullYear()==year) && (i.gphotos_path.match(re)==null))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_mismatchingYears","Show files whose gphotos_path mismatch the file timestamp",true,false,function(files,gphotos) {
        console.log(Object.values(files.cache.filter(i=>(!i.gphotos_path||i.gphotos_path.indexOf(i.timestamp.getFullYear()+"_")!=0))).map(i=>i.toString()).join("\n"));
    }),
    new Action("files_minusGPhotosYear=year","Show files that are not among gphotos for given year",true,true,function(files,gphotos,year) {
        let difference = common.get_difference(
            files.cache.filter(i => (i.timestamp.getFullYear()==year)),
            gphotos.cache.filter(p => (p.timestamp.getFullYear()==year)),
            'file',
            'gphoto');
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
    new Action("files_peek=filePath","Peek at file properties without adding it to cache",true,false,function(files,gphotos,id) {
        files.load(id).then( (item) => {
            console.log(item);
        });
    }),
    new Action("files_updateYear=year","Update cache for all files of given year",true,false,function(files,gphotos,year) {
        files.read(common.filesRoot+"/"+year).then( (files) => {
            console.log("Updated cache information about files of year "+year);
        });
    }),
    new Action("files_upload=cachedid","(Re-)upload cached file to GPhotos",true,true,function(files,gphotos,id) {
        let item = files.cache.get(id);
        if( item ) {
            gphotos.upload(item).then( (gphoto) => {
                console.log("Uploaded file "+item+" to gphoto "+gphoto);
            }).catch( (err) => {
                console.log("Cannot upload file "+item+" ("+err+")");
            });
        }
        else {
            console.log("File id '"+id+"' is not known");
        }
    }),
    new Action("files_uploadMissingGPhotosYear=year","finds all files that are not among GPhotos for a given year and upload them to GPhotos",true,true,function(files,gphotos,year) {
        let difference = common.get_difference(
            files.cache.filter  (i => (i.timestamp.getFullYear()==year)),
            gphotos.cache.filter(p => (p.timestamp.getFullYear()==year)),
            'file',
            'gphoto'
        );
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
    }),
    new Action("files_checkExifTimestampsYear=year","reads files of given year and makes sure that their path  matches their EXIF timestamps",true,false,function(files,gphotos,year) {
        let changed_files = files.check_exif_timestamps(i=>(i.timestamp.getFullYear()==year));
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("files_checkExifTimestampsGPath=pattern","reads all files and makes sure that their path matches their EXIF timestamps",true,false,function(files,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        let changed_files = files.check_exif_timestamps(i=>i.gphotos_path.match(re));
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("\n// Other"),
    new Action("deltaYear=year","a shortcut for --files_minusGPhotosYear=Year --gphotos_minusFilesYear=Year",true,true,function(files,gphotos,year) {
        _ACTIONS.filter(a => ["files_minusGPhotosYear","gphotos_minusFilesYear"].includes(a.name_parts[0])).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(files,gphotos,year);
        });
    }),
    new Action("showYear=year","a shortcut for --files_showYear=Year --gphotos_showYear=Year",true,true,function(files,gphotos,year) {
        _ACTIONS.filter(a => ["files_showYear","gphotos_showYear"].includes(a.name_parts[0])).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(files,gphotos,year);
        });
    }),
    new Action("countByYear","for each year show how many files and gphotos it has",true,true,function(files,gphotos) {
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
    let files   = valid_actions.filter(a=>a.needs_files).length   ? new Files()   : undefined;
    let gphotos = valid_actions.filter(a=>a.needs_gphotos).length ? new GPhotos() : undefined;
    valid_actions.forEach( (a) => {
        try {
            a.call(files,gphotos,common.argv[a.name_parts[0]]);
        }
        catch( err ) {
            console.log("Exception from handler of "+a.name+" ("+err+")");
        };
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
            "   "+process.argv[1]+" --files_minusGPhotosYear=1915 --gphotos_minusFilesYear=1915\n"+
            "Will show all the delta between files stored on file system and in GPhotos for year 1915.\n"
    );
}
