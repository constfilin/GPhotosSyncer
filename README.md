# GPhotosSyncer
An attempt to sync between photos on file system and Google Photos. I developed this to sync an images library stored and tagged in a file system tree to Google Photos and back. Why did I do this? Because I do not want to manually re-tag all my thousands photos in Google Photos.

API access to Google Photos happens by means of [Google Photos API](https://developers.google.com/photos/library/guides/get-started). It came out beginning of May 2018, promises to solve the problem for good however there is a couple of issues:
1. setting image file name [does not work](https://issuetracker.google.com/issues/79757390)
1. getting image file name is harder than it could be (see [this issue](https://issuetracker.google.com/issues/79656863)).

Please run **GPhotosSyncer.js** with **--help** command line option to see what other command line 
options you can give to it.

# Notes
* The tool requires Linux tool **exiftool** (comes with **libimage-exiftool-perl** package on Ubuntu)
* When you first run this tool with a command line option needing knowledge of **images** or **photos**
then the tool attempts to read these using APIs. Since such reading is slow, the tool caches the read
**images** or **photos** in files **./allimages.json** and **./allphotos.json** respectively. Subsequent
attempts to access images or photos de-serialize from these files. If you need to re-read images or
photos again, simply wipe those files out.

# TODO
* Re-organize the sources to **src**, **tests**...
* Add auto tests
* Add integration with CI/CD (see [Travis CI](https://travis-ci.org))
