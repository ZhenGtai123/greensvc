# Sample Inputs

Drop test images here to try SceneRx without your own dataset.

## Expected formats

| Mode | Input | Notes |
|---|---|---|
| **Single view** | One PNG or JPG | Any street-level / park scene; 1024×768 or larger recommended |
| **Panorama** | Equirectangular 360° JPG/PNG | Auto-cropped into left / center / right views by `stage1_preprocess` |

## Suggested test sources

The project did not bundle imagery to keep the repo lightweight. For reproducibility experiments, we recommend pulling from:

- **Mapillary** (CC-BY-SA street-level) — https://www.mapillary.com/app
- **OpenStreetCam** / **Kartaview** — https://kartaview.org/map
- Your own field photography

Place files here and reference them in the UI's project upload, or via the API:

```bash
curl -X POST http://localhost:8000/analyze \
  -F "file=@samples/your_image.jpg" \
  -F 'request_data={"image_id":"test_01"}'
```

## What does NOT belong here

- Image data with restrictive licenses (do not commit copyrighted photos)
- Personally identifiable imagery (faces, license plates) — anonymize first
