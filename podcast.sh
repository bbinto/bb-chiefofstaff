#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: sh podcast.sh <filename_without_extension>"
  exit 1
fi

FILENAME="$1"

python /home/pi/Documents/GitHub/md-to-podcast/md2podcast.py /home/pi/Documents/GitHub/bb-chiefofstaff/reports/${FILENAME}.md /home/pi/Documents/GitHub/md-to-podcast/podcast/${FILENAME}.mp3 --engine edge --publish && python /home/pi/Documents/GitHub/md-to-podcast/upload_podcast_ftp.py