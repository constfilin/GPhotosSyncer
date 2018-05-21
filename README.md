# GPhotosSyncer
An attempt to sync between photos on file system and Google Photos. I developed this to sync an images library stored and tagged in a file system tree to Google Photos and back. Why did I do this? Because I do not want to manually re-tag all my thousands photos in Google Photos.

API access to Google Photos was attempted by three different ways:

* [Google Drive API](https://developers.google.com/drive/). It [did not work](https://kunnas.com/google-photos-is-a-disaster/).
* [Picasa API](https://developers.google.com/gdata/docs/2.0/basics) but it has problems if you attempt to 
  read more than 10000 photos from an ablum. Since Picasa API apparently enumerates photos from
  most recent to least recent, this means that you cannot read the oldest photos in Google Photos. To
  work this around I just had to create a special album where I added all the oldest photos. This version is currently implemented in [master branch](https://github.com/constfilin/GPhotosSyncer/tree/master)
* [Google Photos API](https://developers.google.com/photos/library/guides/get-started). It came out beginning of May 2018, promises to solve the problem for good (however see [this issue](https://issuetracker.google.com/issues/79656863)). This version is currently implemented in [promises_and_gphotos_api branch](https://github.com/constfilin/GPhotosSyncer/tree/promises_and_gphotos_api)

Please run **GPhotosSyncer.js** with **--help** command line option to see what other command line 
options you can give to it.

# Note
When you first run this tool with a command line option needing knowledge of **images** or **photos**
then the tool attempts to read these using APIs. Since such reading is slow, the tool caches the read
**images** or **photos** in files **./allimages.json** and **./allphotos.json** respectively. Subsequent
attempts to access images or photos de-serialize from these files. If you need to re-read images or
photos again, simply wipe those files out.
