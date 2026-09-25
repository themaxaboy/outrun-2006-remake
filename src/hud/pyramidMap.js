// SVG mini-map of the 15-stage pyramid. Highlights the visited route and the current stage.
const NS = 'http://www.w3.org/2000/svg'

export function createPyramidMap() {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 120 92')
  svg.classList.add('pyr')
  const nodes = new Map()
  const pos = (r, c) => [60 + (c - r / 2) * 22, 10 + r * 18]
  const lines = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c <= r; c++) {
      for (const d of [0, 1]) {
        const [x1, y1] = pos(r, c)
        const [x2, y2] = pos(r + 1, c + d)
        const l = document.createElementNS(NS, 'line')
        l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2)
        l.classList.add('pyr-edge')
        l.dataset.key = `${r}-${c}>${r + 1}-${c + d}`
        svg.appendChild(l)
        lines.push(l)
      }
    }
  }
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= r; c++) {
      const [x, y] = pos(r, c)
      const n = document.createElementNS(NS, 'circle')
      n.setAttribute('cx', x); n.setAttribute('cy', y); n.setAttribute('r', r === 4 ? 5 : 4)
      n.classList.add('pyr-node')
      if (r === 4) n.classList.add('goal')
      svg.appendChild(n)
      nodes.set(`${r}-${c}`, n)
    }
  }
  return {
    el: svg,
    set(visited, current) {
      for (const n of nodes.values()) n.classList.remove('visited', 'current')
      for (const l of lines) l.classList.remove('visited')
      visited.forEach((id, i) => {
        nodes.get(id)?.classList.add('visited')
        if (i > 0) svg.querySelector(`[data-key="${visited[i - 1]}>${id}"]`)?.classList.add('visited')
      })
      nodes.get(current)?.classList.add('current')
    },
  }
}
