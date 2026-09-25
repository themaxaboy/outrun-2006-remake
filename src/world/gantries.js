// Start / checkpoint / goal arches and the overhead fork sign. Text is drawn on canvas textures.
import * as THREE from 'three'

function textTexture(lines, { w = 1024, h = 256, bg = '#0b3d91', fg = '#ffffff', border = '#ffffff', font = 'italic 900 120px sans-serif', align = 'center', arrows = null } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, h)
  if (Array.isArray(bg)) { grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]); g.fillStyle = grad } else g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.strokeStyle = border
  g.lineWidth = 10
  g.strokeRect(12, 12, w - 24, h - 24)
  g.fillStyle = fg
  g.textBaseline = 'middle'
  g.font = font
  g.textAlign = align
  const x = align === 'left' ? 60 : align === 'right' ? w - 60 : w / 2
  lines.forEach((t, i) => g.fillText(t, x, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.4))))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()

/** Orient an object on the road frame at s. */
function placeOnRoad(obj, course, s) {
  const fr = course.sample(s)
  const N = new THREE.Vector3(Math.cos(fr.heading), 0, Math.sin(fr.heading))
  const U = new THREE.Vector3(0, 1, 0)
  const B = new THREE.Vector3(-Math.sin(fr.heading), 0, Math.cos(fr.heading))
  _m.makeBasis(N, U, B)
  _q.setFromRotationMatrix(_m)
  obj.position.set(fr.x, fr.y, fr.z)
  obj.quaternion.copy(_q)
  return fr
}

export class Gantries {
  constructor(scene, atmo) {
    this.scene = scene
    this.atmo = atmo
    this.byCourse = new Map() // uid → [objects]
    this.frame = atmo.applyFog(new THREE.MeshStandardMaterial({ color: 0xd6dbe2, metalness: 0.6, roughness: 0.35 }))
    this.dark = atmo.applyFog(new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.3, roughness: 0.6 }))
    this.signMats = []
  }

  _signMat(tex) {
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 })
    this.atmo.applyFog(m)
    this.signMats.push(m)
    return m
  }

  _arch(course, s, label, colors) {
    const g = new THREE.Group()
    const fr = placeOnRoad(g, course, s)
    const W = fr.hw + 3.2
    const H = 8.5
    const post = new THREE.BoxGeometry(1.0, H, 1.0)
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(post, this.frame)
      p.position.set(sx * W, H / 2, 0)
      g.add(p)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.4, 2.6, 0.9), this.dark)
    beam.position.set(0, H + 0.6, 0)
    g.add(beam)
    const tex = textTexture([label], { w: 1024, h: 160, bg: colors, font: 'italic 900 112px sans-serif' })
    const mat = this._signMat(tex)
    for (const z of [0.47, -0.47]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 0.8, 2.3), mat)
      sign.position.set(0, H + 0.6, z)
      if (z < 0) sign.rotation.y = Math.PI
      g.add(sign)
    }
    // flags / checker strip on the road
    return g
  }

  _forkSign(course, left, right) {
    const s = course.length - 430
    const g = new THREE.Group()
    const fr = placeOnRoad(g, course, s)
    const W = fr.hw + 2.5
    const H = 7.2
    const post = new THREE.BoxGeometry(0.7, H, 0.7)
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(post, this.frame)
      p.position.set(sx * W, H / 2, 0)
      g.add(p)
    }
    const truss = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.5, 0.5), this.frame)
    truss.position.set(0, H, 0)
    g.add(truss)
    const mk = (text, x, align) => {
      const tex = textTexture([text], { w: 1024, h: 256, bg: '#0a5a2a', font: 'italic 800 84px sans-serif', align })
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, W * 0.92 / 4), this._signMat(tex))
      m.position.set(x, H + 1.9, 0.3)
      g.add(m)
    }
    mk('◀  ' + left, -W * 0.5, 'left')
    mk(right + '  ▶', W * 0.5, 'right')
    return g
  }

  decorate(course) {
    if (this.byCourse.has(course.uid)) return
    const objs = []
    if (course.entry === 'start') objs.push(this._arch(course, 50, 'START', ['#d2261f', '#7a0f0b']))
    else objs.push(this._arch(course, 140, 'CHECKPOINT', ['#1e5bd6', '#0b2a70']))
    if (course.goal) objs.push(this._arch(course, course.length - 90, 'GOAL', ['#ff9f1a', '#c2410c']))
    else if (course.children) objs.push(this._forkSign(course, course.children[0].stage.name, course.children[1].stage.name))
    for (const o of objs) this.scene.add(o)
    this.byCourse.set(course.uid, { course, objs, hasFork: !!course.children || course.goal })
  }

  /** Keep decorations for relevant courses only. */
  sync(route) {
    const cur = route.current
    const keep = new Set([cur.uid])
    if (route.previous) keep.add(route.previous.uid)
    if (cur.sibling) keep.add(cur.sibling.uid)
    if (cur.children) for (const c of cur.children) keep.add(c.uid)
    for (const c of [cur, ...(cur.children || [])]) {
      const e = this.byCourse.get(c.uid)
      // (re)decorate when children appear after the first pass
      if (e && !e.hasFork && c.children) { this._remove(c.uid) }
      this.decorate(c)
    }
    for (const uid of [...this.byCourse.keys()]) if (!keep.has(uid)) this._remove(uid)
  }

  _remove(uid) {
    const e = this.byCourse.get(uid)
    if (!e) return
    for (const o of e.objs) {
      this.scene.remove(o)
      o.traverse((n) => {
        if (n.isMesh) {
          n.geometry.dispose()
          if (n.material.map) { n.material.map.dispose(); n.material.dispose() }
        }
      })
    }
    this.byCourse.delete(uid)
  }

  clear() { for (const uid of [...this.byCourse.keys()]) this._remove(uid) }
}
