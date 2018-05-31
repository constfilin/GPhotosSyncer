# GPhotosSyncer
I developed **GPhotosSyncer** to sync an images library stored and tagged in a file system tree to Google Photos and back. 
Why did I do this? Because I do not want to manually re-tag all my thousands photos in Google Photos.

API access to Google Photos happens by means of [Google Photos API](https://developers.google.com/photos/library/guides/get-started). It came out beginning of May 2018, promises to solve the problem for good however there is a couple of issues:
1. setting image file name [does not work](https://issuetracker.google.com/issues/79757390)
1. getting image file name is harder than it could be (see [this issue](https://issuetracker.google.com/issues/79656863)).
1. I still haven't figured out how to get from the API raw bytes of images that I have once uploaded to there

Running **GPhotosSyncer.js** with **--help** produces a list of command line options:
```
USAGE: ./GPhotosSyncer.js [--loglevel=loglevel] --action --action...
--loglevel - defines verbosity.
--action   - describes what we are going to do, one of:

// Actions on Google Photos
    // Updating cache
    gphotos_cache=mediaId                    - Add gphoto to cache by its mediaId in Google Photos
    gphotos_uncache=cacheid                  - Delete cache item by id (but leave gphoto)
    gphotos_update=cacheid                   - Update cache item by id with info from Google Photos
    gphotos_updateAll                        - Update cache for ALL gphotos (do 'rm ./gphotos.json' first!)
    // Inspecting cache
    gphotos_count                            - Show the total count of gphotos
    gphotos_countByYear                      - Show the number of gphotos for each year
    gphotos_get=cacheid                      - Show a cached gphoto
    gphotos_grepGPath=pattern                - Show gphotos with gphotos_path matching regexp
    gphotos_grepvGPath=pattern               - Show gphotos with gphotos_path not matching regexp
    gphotos_grepEXIFDate=pattern             - Show gphotos with EXIF timestamp matching regexp
    gphotos_grepvEXIFDate=pattern            - Show gphotos with EXIF timestamp not matching regexp
    gphotos_grepEXIFMismatches=pattern       - Show gphotos with EXIF timestamp matching regexp but gphotos_path not corresponding to the timestamp
    gphotos_deltaEXIFDate=pattern            - Show gphotos with EXIF date matching a regexp that are not among the files with EXIF date matching the same regexp
    // Other operations
    gphotos_syncEXIFDate=pattern             - Download gphotos with EXIF date matching a regexp that are not among the files with EXIF date matching the same regexp
    gphotos_peek=mediaId                     - Peek at gphoto without adding it to cache
    gphotos_updateAlbum=albumId              - Update cache for all gphotos in album
    gphotos_getAlbums                        - List your gphotos albums

// Actions on File System
    // Updating cache
    files_cache=filePath                     - Add a file to cache
    files_uncache=cacheid                    - Delete cached file by id (but leave file itself)
    files_update=cacheid                     - Update cached file by id with info from File System
    files_updateAll                          - Update cached information for ALL files  (do 'rm ./files.json' first!)
    // Inspecting cache
    files_count                              - Show the total count of files
    files_countByYear                        - Show the number of files for each year
    files_get=cacheid                        - Show a cached file
    files_grepGPath=pattern                  - Show files with gphotos_path matching regexp
    files_grepvGPath=pattern                 - Show files with gphotos_path not matching regexp
    files_grepEXIFDate=pattern               - Show files with EXIF timestamp matching regexp
    files_grepvEXIFDate=pattern              - Show files with EXIF timestamp not matching regexp
    files_grepEXIFMismatches=pattern         - Show files with EXIF timestamp matching regexp but gphotos_path not corresponding to the timestamp
    files_deltaEXIFDate=pattern              - Show files with EXIF date matching a regexp that are not among gphotos with EXIF date matching the same regexp
    // Other operations
    files_peek=filePath                      - Peek at file properties without adding it to cache
    files_updateYear=year                    - Update cache for all files of given year
    files_sync=cachedid_or_filepath          - (Re-)upload cached file to GPhotos
    files_syncEXIFDate=pattern               - Upload files with EXIF date matching a regexp that are not among gphotos with EXIF date matching the same regexp
    files_checkTimestampsGPath=pattern       - For files with GPath matching regexp, check that file is where it is supposed to be on the file system
    files_checkTimestampsEXIFDate=pattern    - For files with EXIFDate matching regexp, check that file is where it is supposed to be on the file system

// Other
    deltaEXIFDate=pattern                    - a shortcut for --files_deltaEXIFDate=pattern --gphotos_deltaEXIFDate=pattern
    grepEXIFDate=pattern                     - a shortcut for --files_grepEXIFDate=pattern --gphotos_grepEXIFDate=pattern
    countByYear                              - for each year show how many files and gphotos it has

If several actions are given on the command line then all of them are executed in the given order
E.G.:
   ./GPhotosSyncer.js --files_deltaGPhotosYear=1915 --gphotos_deltaFilesYear=1915
Will show the delta between files stored on file system and in GPhotos for year 1915.
```

# Notes
* The tool requires Linux tool **exiftool** (comes with **libimage-exiftool-perl** package on Ubuntu)
* When you first run this tool with a command line option needing knowledge of **files** or **photos**
then the tool attempts to read these using APIs. Since such reading is slow, the tool caches the read
**files** or **gphotos** in files **./files.json** and **./gphotos.json** respectively. Subsequent
attempts to access files or photos de-serialize from these files. If you need to re-read files or
photos again, simply wipe those files out.

# TODO
* Re-organize the sources to **src**, **tests**...
* Add auto tests
* Add integration with CI/CD (see [Travis CI](https://travis-ci.org))
