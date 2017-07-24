# GPhotosSyncer
An attempt to sync between photos on file system and GPhotos

I developed this to sync an images library stored and tagged in a file system tree 
to Google Photos and back. 

Google Drive API [does not work](https://kunnas.com/google-photos-is-a-disaster/) for this purpose.
This is why I switched to [Picasa API](https://developers.google.com/gdata/docs/2.0/basics) but it
also has its onw limitations.

[Picasa API](https://developers.google.com/gdata/docs/2.0/basics) errors out if you attempts to 
read more than 10000 photos from an ablum. Since Picasa API apparently enumerates photos from
most recent to least recent, this means that you cannot read the oldest photos in GPhotos. To
work this around I just had to create a special album where I added all the oldest photos. 

Please run **GPhotosSyncer.js** with **--help** command line option to see what other command line 
options you can give to it.
