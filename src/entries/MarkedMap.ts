import { Map, Overlay, View } from 'ol'
import { getCenter } from 'ol/extent'
import { Image } from 'ol/layer'
import Projection from 'ol/proj/Projection'
import { ImageStatic } from 'ol/source'
function init() {
  document.querySelectorAll('.marked-map').forEach((ele) => {
    if (!(ele instanceof HTMLElement))
      return
    const data = ele.dataset
    if (!data.url || !data.left || !data.right || !data.bottom || !data.top)
      return
    const url = data.url
    const extent = [parseInt(data.left), parseInt(data.bottom), parseInt(data.right), parseInt(data.top)]
    const projection = new Projection({
      code: 'xkcd-image',
      units: 'pixels',
      extent,
    })
    const overlays = Array.from(ele.children).map((child) => {
      if (!(child instanceof HTMLElement))
        return undefined
      if (!child.dataset.x || !child.dataset.y)
        return undefined
      return new Overlay({
        element: child as HTMLElement,
        autoPan: {
          animation: {
            duration: 250,
          },
        },
        position: [parseFloat(child.dataset.x), parseFloat(child.dataset.y)],
      })
    }).filter(v => !!v) as Overlay[]
    const map = new Map({
      layers: [
        new Image({
          source: new ImageStatic({ url, imageExtent: extent, projection }),
        }),
      ],
      target: ele,
      overlays,
      view: new View({
        center: getCenter(extent),
        zoom: 2,
        maxZoom: 8,
        projection,
      }),
    })

    map.on('singleclick', (evt) => {
      const coordinate = evt.coordinate
      console.log(coordinate)
    })
  })
}
if (document.readyState === 'complete') {
  init()
}
else {
  document.addEventListener('DOMContentLoaded', () => {
    init()
  })
}
