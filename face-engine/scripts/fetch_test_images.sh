#!/usr/bin/env bash
# Fetches the (gitignored) real test images test_pipeline.py needs.
# Public-domain/standard CV sample images, not committed to the repo.
set -e
cd "$(dirname "$0")/.."
mkdir -p tmp_test
curl -sL -o tmp_test/lena.jpg "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg"
curl -sL -o tmp_test/nofaceimg.jpg "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/HappyFish.jpg"
echo "Fetched test images into tmp_test/"
