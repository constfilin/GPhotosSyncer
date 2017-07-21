# GPhotosSyncer
An attempt to sync between photos on file system and GPhotos

I developed this to sync an images library stored and tagged in a file system tree 
to Google Photos and back. Everything went fine until I discovered that not all GPhotos
can be read with the help of Google Drive API.

Then I discovered https://kunnas.com/google-photos-is-a-disaster/.

For now I stopped attempts to read/write images to Google Photos but I put this 
into Github because at the very least the tool is already capable of reading EXIF 
infomration in images and comapre it with time based image location on the file system.

If and when Google provides GPhotos API, I am going to come back to this and write 
a much better description of what the code does. Meanwhile you can run GPhotosSyncer
tool with key --help or just use the force, look the source.


