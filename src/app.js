import * as THREE from 'https://esm.sh/three@0.164.1';
import { OrbitControls } from 'https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const DATA = window.FALLING_SKY_DATA;
const fmt = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const $ = (id) => document.getElementById(id);
const RADIUS = 260;
const LON_CENTER = -98;
const stateByName = Object.fromEntries(DATA.states.map(s => [s.state, s]));
const positiveMasses = DATA.points.map(p => p.m || 0).filter(m => m > 0);
const MASS_MIN = Math.min(...positiveMasses);
const MASS_MAX = Math.max(...positiveMasses);
let map;
let activeFilter = 'all';
let selectedState = 'Texas';

function kg(g){ return g == null ? 'unknown' : `${fmt.format(Math.round(g / 100) / 10)} kg`; }
function grams(g){ return g == null ? 'unknown' : `${fmt.format(Math.round(g))} g`; }
function yearText(y){ return y || 'unknown'; }
function shortClass(c){ return (c || 'Unknown').replace('Ordinary chondrite', 'Chondrite'); }
function massScale(g){ return Math.max(2.0, Math.min(16, 1.4 + Math.log10(Math.max(1, g || 1)) * 1.55)); }
function massBarHeight(g){
  if(!g || g <= 0) return 5;
  const lo = Math.log10(Math.max(0.001, MASS_MIN));
  const hi = Math.log10(MASS_MAX);
  const n = Math.max(0, Math.min(1, (Math.log10(g) - lo) / (hi - lo)));
  return 8 + Math.pow(n, 1.14) * 142;
}
function colorForPoint(p){
  if(p.s === selectedState) return new THREE.Color(0xf5b900);
  if(p.f === 'Fell') return new THREE.Color(0xff2f7d);
  if((p.m || 0) >= 1000000) return new THREE.Color(0xf5b900);
  if(/^Iron/i.test(p.c || '')) return new THREE.Color(0xff6a1a);
  return new THREE.Color(0xe0115f);
}
function passesFilter(p){
  if(activeFilter === 'fell') return p.f === 'Fell';
  if(activeFilter === 'found') return p.f === 'Found';
  if(activeFilter === 'heavy') return (p.m || 0) >= 100000;
  if(activeFilter === 'us') return !!p.s;
  return true;
}
function latLonToVec(lat, lon, radius = RADIUS){
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lon - LON_CENTER);
  const x = radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.cos(theta);
  return new THREE.Vector3(x,y,z);
}

class FallingSkyGlobe{
  constructor(container){
    this.container = container;
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 2200);
    this.camera.position.set(0, 210, 690);
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, preserveDrawingBuffer:true });
    this.renderer.setClearColor(0x05080a, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .06;
    this.controls.minDistance = 430;
    this.controls.maxDistance = 940;
    this.controls.enablePan = false;
    this.controls.target.set(0, 50, 0);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tmp = new THREE.Object3D();
    this.pointByInstance = [];
    this.addLights();
    this.addEarth();
    this.addWorldOutlines();
    this.addStateBorders();
    this.addMeteorites();
    this.addAtmosphere();
    this.bind();
    this.resize();
    this.animate();
  }
  addLights(){
    this.scene.add(new THREE.AmbientLight(0x3a180f, 1.08));
    const key = new THREE.DirectionalLight(0xf5b900, 2.15); key.position.set(-280, 340, 560); this.scene.add(key);
    const hot = new THREE.PointLight(0xe0115f, 3.4, 900); hot.position.set(260, 80, 420); this.scene.add(hot);
    const orange = new THREE.PointLight(0xff6a1a, 2.0, 820); orange.position.set(-260, 220, 380); this.scene.add(orange);
  }
  addEarth(){
    const geo = new THREE.SphereGeometry(RADIUS, 128, 64);
    const texture = new THREE.TextureLoader().load('./assets/earth-dark.png?v=dark-earth-bars-20260703');
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.earthMat = new THREE.ShaderMaterial({
      uniforms:{
        globeTexture:{value:texture},
        lonCenter:{value:THREE.MathUtils.degToRad(LON_CENTER)},
        rimColor:{value:new THREE.Color(0x5e3920)}
      },
      vertexShader:`varying vec3 vNormal; varying vec3 vPos; void main(){ vNormal=normalize(normalMatrix*normal); vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`uniform sampler2D globeTexture; uniform float lonCenter; uniform vec3 rimColor; varying vec3 vNormal; varying vec3 vPos; const float PI=3.141592653589793; void main(){ vec3 n=normalize(vPos); float lon=atan(n.x,n.z)+lonCenter; float u=fract((lon+PI)/(2.0*PI)); float v=0.5-asin(clamp(n.y,-1.0,1.0))/PI; vec3 landOcean=texture2D(globeTexture, vec2(u,v)).rgb; float softLight=max(dot(n,normalize(vec3(-0.35,0.55,0.75))),0.0); float rim=pow(1.0-abs(vNormal.z),2.05); vec3 col=landOcean*(0.82+softLight*.44)+rimColor*rim*.92; gl_FragColor=vec4(col,1.0); }`
    });
    const earth = new THREE.Mesh(geo, this.earthMat);
    earth.position.y = -115;
    this.scene.add(earth);
    const grid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(RADIUS+1.5, 32, 16)), new THREE.LineBasicMaterial({color:0xf5b900, transparent:true, opacity:.07}));
    grid.position.copy(earth.position); this.scene.add(grid);
    this.earthOffsetY = earth.position.y;
  }
  addAtmosphere(){
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(RADIUS+8, 96, 48), new THREE.MeshBasicMaterial({ color:0xe0115f, transparent:true, opacity:.11, side:THREE.BackSide }));
    atmo.position.y = this.earthOffsetY; this.scene.add(atmo);
  }
  addWorldOutlines(){
    fetch('./assets/world-land-outlines.json?v=continent-lines-20260703').then(r=>r.json()).then(world=>{
      const mat = new THREE.LineBasicMaterial({ color:0xf1dfbf, transparent:true, opacity:.20, depthTest:true, depthWrite:false });
      const accent = new THREE.LineBasicMaterial({ color:0xf5b900, transparent:true, opacity:.13, depthTest:true, depthWrite:false });
      this.worldOutlineGroup = new THREE.Group();
      world.rings.forEach((ring, i)=>{
        const pts = ring.map(([lon,lat]) => latLonToVec(lat, lon, RADIUS + 2.8).add(new THREE.Vector3(0,this.earthOffsetY,0)));
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        this.worldOutlineGroup.add(new THREE.Line(geom, i % 5 === 0 ? accent : mat));
      });
      this.scene.add(this.worldOutlineGroup);
    });
  }
  addStateBorders(){
    fetch('./src/us-states.json').then(r=>r.json()).then(geojson=>{
      const mat = new THREE.LineBasicMaterial({ color:0xf5b900, transparent:true, opacity:.78 });
      const dim = new THREE.LineBasicMaterial({ color:0xf1dfbf, transparent:true, opacity:.24 });
      this.stateLines = [];
      for(const f of geojson.features){
        const group = new THREE.Group(); group.userData.name = f.properties.name;
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for(const poly of polys){
          const ring = poly[0];
          const pts = ring.map(([lon,lat]) => latLonToVec(lat, lon, RADIUS + 4).add(new THREE.Vector3(0,this.earthOffsetY,0)));
          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geom, f.properties.name === selectedState ? mat : dim);
          group.add(line);
        }
        this.stateLines.push(group); this.scene.add(group);
      }
      this.updateStateLines();
    });
  }
  addMeteorites(){
    const visible = DATA.points;
    const hitGeo = new THREE.IcosahedronGeometry(1, 1);
    const hitMat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0, colorWrite:false, depthWrite:false });
    this.inst = new THREE.InstancedMesh(hitGeo, hitMat, visible.length);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(visible.length * 3), 3);
    const barPositions = new Float32Array(visible.length * 2 * 3);
    const barColors = new Float32Array(visible.length * 2 * 3);
    this.barColors = barColors;
    this.barBaseColors = [];
    const color = new THREE.Color();
    visible.forEach((p, i)=>{
      const normal = latLonToVec(p.lat, p.lon, 1).normalize();
      const surface = latLonToVec(p.lat, p.lon, RADIUS + 7).add(new THREE.Vector3(0,this.earthOffsetY,0));
      const height = massBarHeight(p.m);
      const end = surface.clone().add(normal.clone().multiplyScalar(height));
      const offset = i * 6;
      barPositions[offset] = surface.x; barPositions[offset+1] = surface.y; barPositions[offset+2] = surface.z;
      barPositions[offset+3] = end.x; barPositions[offset+4] = end.y; barPositions[offset+5] = end.z;
      const s = Math.max(3.0, Math.min(18, massScale(p.m) * 1.15));
      this.tmp.position.copy(surface.clone().add(normal.clone().multiplyScalar(Math.max(3, height*.45))));
      this.tmp.scale.setScalar(s);
      this.tmp.lookAt(0, this.earthOffsetY, 0);
      this.tmp.updateMatrix();
      this.inst.setMatrixAt(i, this.tmp.matrix);
      color.copy(colorForPoint(p));
      this.inst.setColorAt(i, color);
      this.barBaseColors[i] = color.clone();
      barColors[offset] = barColors[offset+3] = color.r;
      barColors[offset+1] = barColors[offset+4] = color.g;
      barColors[offset+2] = barColors[offset+5] = color.b;
      this.pointByInstance[i] = p;
    });
    this.scene.add(this.inst);
    this.barGeom = new THREE.BufferGeometry();
    this.barGeom.setAttribute('position', new THREE.BufferAttribute(barPositions, 3));
    this.barGeom.setAttribute('color', new THREE.BufferAttribute(barColors, 3));
    this.barMat = new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true });
    this.bars = new THREE.LineSegments(this.barGeom, this.barMat);
    this.scene.add(this.bars);
    this.updateMeteoriteVisibility();
  }
  bind(){
    window.addEventListener('resize',()=>this.resize());
    this.renderer.domElement.addEventListener('pointermove', e=>this.onPointer(e, false));
    this.renderer.domElement.addEventListener('click', e=>this.onPointer(e, true));
  }
  resize(){
    const r=this.container.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || r.width;
    const width = Math.max(1, Math.floor(Math.min(r.width, viewportWidth)));
    const height = Math.max(1, Math.floor(r.height));
    this.camera.aspect=width/height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
    const canvas=this.renderer.domElement;
    canvas.style.width='100%'; canvas.style.maxWidth='100%'; canvas.style.height='100%';
  }
  updateMeteoriteVisibility(){
    if(!this.inst) return;
    const c = new THREE.Color();
    for(let i=0;i<this.pointByInstance.length;i++){
      const p=this.pointByInstance[i];
      const show = passesFilter(p);
      c.copy(colorForPoint(p));
      let mult = show ? 1 : .035;
      if(activeFilter === 'heavy' && !show) mult = 0;
      if(activeFilter === 'us' && p.s && p.s !== selectedState) mult *= .22;
      c.multiplyScalar(mult);
      this.inst.setColorAt(i,c);
      if(this.barColors){
        const offset=i*6;
        this.barColors[offset]=this.barColors[offset+3]=c.r;
        this.barColors[offset+1]=this.barColors[offset+4]=c.g;
        this.barColors[offset+2]=this.barColors[offset+5]=c.b;
      }
    }
    this.inst.instanceColor.needsUpdate=true;
    if(this.barGeom) this.barGeom.attributes.color.needsUpdate = true;
  }
  updateStateLines(){
    if(!this.stateLines) return;
    this.stateLines.forEach(g=>{
      const is = g.userData.name === selectedState;
      g.children.forEach(line=>{ line.material.color.set(is ? 0xffe36a : 0x18f7ff); line.material.opacity = is ? .95 : .27; });
    });
  }
  onPointer(e, click){
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.pointer.x=((e.clientX-rect.left)/rect.width)*2-1; this.pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObject(this.inst || new THREE.Object3D());
    if(hits.length){
      document.body.style.cursor='pointer';
      if(click){
        const p=this.pointByInstance[hits[0].instanceId];
        selectMeteorite(p);
        if(p.s) selectState(p.s, false);
      }
    } else document.body.style.cursor='default';
  }
  animate(){
    requestAnimationFrame(()=>this.animate());
    const t=this.clock.getElapsedTime();
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
  }
}

function initStats(){
  const s=DATA.summary;
  $('stats').innerHTML = `
    <div class="signal-label"><b>ARCHIVE SIGNAL</b><span>NASA meteorite landing dataset</span></div>
    ${[
      [fmt.format(s.downloadedRows), 'records'],
      [fmt.format(s.geocodedRows), 'geocoded'],
      [fmt.format(s.fallCounts.Fell), 'fell'],
      [kg(s.massMaxG), 'max mass']
    ].map(([n,l])=>`<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('')}
  `;
}
function initTruth(){
  const s=DATA.summary;
  const items=[
    ['Fields in the file', 'name, id, nametype, recclass, mass (g), fall, year, reclat, reclong, GeoLocation'],
    ['What mass means', `${fmt.format(s.massRows)} records include recovered mass in grams. Marker size uses recovered mass, not original atmospheric mass.`],
    ['Fall status', `${fmt.format(s.fallCounts.Fell)} Fell records were witnessed falling; ${fmt.format(s.fallCounts.Found)} were Found later.`],
    ['No speed field', 'The dataset does not include impact speed, entry angle, crater size, or damage. This app does not invent those values.'],
    ['State stats', 'U.S. state counts are derived from latitude/longitude plus state boundary polygons.'],
    ['Class examples', s.topClasses.slice(0,6).map(c=>`${c.name} (${fmt.format(c.count)})`).join(' · ')]
  ];
  $('truthGrid').innerHTML=items.map(([b,txt])=>`<div class="truth"><b>${b}</b><span>${txt}</span></div>`).join('');
}
function selectMeteorite(p){
  $('objectName').textContent = p.n || 'Unnamed meteorite';
  $('objectCaption').textContent = p.s ? `${p.s} archive object · ${p.f}` : `Global archive object · ${p.f}`;
  $('objectMass').textContent = kg(p.m);
  $('objectDetails').innerHTML = [
    ['fall status', p.f], ['class', shortClass(p.c)], ['recorded year', yearText(p.y)], ['nametype', p.t], ['coordinates', `${p.lat}, ${p.lon}`], ['state', p.s || 'outside U.S. state layer']
  ].map(([b,v])=>`<div class="detail"><b>${b}</b><span>${v}</span></div>`).join('');
}
function selectState(name, updateMeteorites=true){
  selectedState=name;
  $('stateSelect').value=name;
  const s=stateByName[name];
  if(!s) return;
  $('stateReadout').innerHTML=`<strong>${s.state}</strong><p>${fmt.format(s.count)} known meteorites · ${kg(s.massG)} total recovered mass · ${fmt.format(s.fell)} witnessed falls · ${fmt.format(s.found)} found later</p><p>Largest: <b>${s.largest?.name || 'unknown'}</b> (${kg(s.largest?.massG)}) · Top class: <b>${s.topClass?.name || 'unknown'}</b> · Record years: ${s.yearMin || 'unknown'}–${s.yearMax || 'unknown'}</p>`;
  if(map){ map.updateStateLines(); if(updateMeteorites) map.updateMeteoriteVisibility(); }
}
function initStates(){
  const states=DATA.states.filter(s=>s.count>0);
  $('stateSelect').innerHTML=states.map(s=>`<option value="${s.state}">${s.state}</option>`).join('');
  $('stateSelect').addEventListener('change', e=>selectState(e.target.value));
  $('stateBoard').innerHTML=states.slice(0,12).map((s,i)=>`<div class="state-row" data-state="${s.state}"><b>#${i+1}</b><span>${s.state}</span><small>${fmt.format(s.count)} objects · ${kg(s.massG)}</small></div>`).join('');
  $('stateBoard').addEventListener('click', e=>{ const row=e.target.closest('.state-row'); if(row) { activeFilter='us'; syncFilters(); selectState(row.dataset.state); }});
  selectState(selectedState, false);
}
function initLeaderboard(){
  $('leaderboard').innerHTML=DATA.points.slice(0,12).map((p,i)=>`<div class="leader-row"><b>#${i+1}</b><span>${p.n}</span><small>${kg(p.m)}</small><em>${p.c} · ${p.y || 'unknown'} · ${p.s || 'global'}</em></div>`).join('');
}
function syncFilters(){
  document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active', b.dataset.filter===activeFilter));
  if(map) map.updateMeteoriteVisibility();
}
function bindFilters(){
  document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{ activeFilter=btn.dataset.filter; syncFilters(); }));
}
function bindTabs(){
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    const target=btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t===btn));
    document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active', panel.dataset.panel===target));
  }));
}
function init(){
  initStats(); initTruth(); initStates(); initLeaderboard(); bindFilters(); bindTabs();
  const defaultPoint = DATA.points.find(p=>p.n === 'Canyon Diablo') || DATA.points[0];
  selectMeteorite(defaultPoint);
  map = new FallingSkyGlobe($('scene'));
  window.fallingSky = {DATA, map, selectState, selectMeteorite};
}

init();
