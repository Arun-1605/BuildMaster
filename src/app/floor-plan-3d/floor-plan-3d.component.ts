import {
  Component, OnInit, AfterViewInit, ViewChild, ElementRef,
  OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import * as THREE from 'three';
import { API_URLS } from '../core/constants';

// ── Types ──────────────────────────────────────────────────────────────────

type RoomType = 'Master Bedroom' | 'Bedroom' | 'Living Room' | 'Dining Room' |
  'Kitchen' | 'Bathroom' | 'Toilet' | 'Balcony' | 'Pooja Room' | 'Study Room' |
  'Store Room' | 'Garage' | 'Lobby' | 'Staircase';

interface Room {
  id: number;
  name: string;
  type: RoomType;
  width: number;   // metres
  depth: number;
  x: number;       // placed position on canvas grid
  y: number;
  color: string;
  rotated?: boolean; // for Staircase: when true steps run E-W instead of N-S
}

interface ColumnItem {
  id: number;
  x: number;    // metres from plot origin
  y: number;
  size: number; // side length in metres (default 0.3)
}

interface WindowItem {
  id: number;
  roomId: number;
  wall: 'N' | 'S' | 'E' | 'W';
  offset: number;  // metres from the wall's start edge
  width: number;   // metres (default 1.2)
}

interface DoorItem {
  id: number;
  roomId: number;
  wall: 'N' | 'S' | 'E' | 'W';
  offset: number;  // metres from the wall's start edge
  width: number;   // metres (default 0.9)
  hingeLeft: boolean;
}

interface FloorConfig {
  floorNumber: number;
  rooms: Room[];
  columns: ColumnItem[];
  windows: WindowItem[];
  doors: DoorItem[];
}

interface SetbackConfig {
  north: number;   // metres
  south: number;
  east: number;
  west: number;
}

interface SiteConfig {
  plotWidth: number;   // metres
  plotDepth: number;
  facing: 'North' | 'South' | 'East' | 'West';
  floors: number;
  floorHeight: number; // metres (for 3D)
  setbacks: SetbackConfig;
}

// ── Component ─────────────────────────────────────────────────────────────

@Component({
  selector: 'app-floor-plan-3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './floor-plan-3d.component.html',
  styleUrls: ['./floor-plan-3d.component.css']
})
export class FloorPlan3DComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('canvas2d')      canvas2dRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('canvas3d')      canvas3dRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasElev')    canvasElevRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasTopElev') canvasTopElevRef!: ElementRef<HTMLCanvasElement>;

  // Replace activeTab with activeView supporting 2d | elev | 3d
  activeView: '2d' | 'elev' | '3d' = '2d';
  elevSubView: 'front' | 'top' = 'front';
  // Keep activeTab as alias for backward compatibility with applyAIPreset check
  get activeTab(): '2d' | '3d' {
    return this.activeView === '3d' ? '3d' : '2d';
  }

  activeFloor = 0;

  // ── Unit system ──────────────────────────────────────────────────────────
  unit: 'm' | 'ft' = 'm';
  readonly FT = 3.28084;

  toD(m: number): number {
    if (this.unit === 'ft') return Math.round(m * this.FT * 100) / 100;
    return Math.round(m * 100) / 100;
  }

  fromD(v: number): number {
    if (this.unit === 'ft') return v / this.FT;
    return v;
  }

  get uL(): string { return this.unit === 'ft' ? 'ft' : 'm'; }
  get uLSq(): string { return this.unit === 'ft' ? 'sq ft' : 'm²'; }
  get inputStep(): number { return this.unit === 'ft' ? 0.5 : 0.1; }

  site: SiteConfig = {
    plotWidth: 15,
    plotDepth: 20,
    facing: 'North',
    floors: 2,
    floorHeight: 3,
    setbacks: { north: 1.5, south: 1, east: 1, west: 1 }
  };

  floors: FloorConfig[] = [];

  ROOM_TYPES: RoomType[] = [
    'Master Bedroom', 'Bedroom', 'Living Room', 'Dining Room', 'Kitchen',
    'Bathroom', 'Toilet', 'Balcony', 'Pooja Room', 'Study Room',
    'Store Room', 'Garage', 'Lobby', 'Staircase'
  ];

  ROOM_COLORS: Record<RoomType, string> = {
    'Master Bedroom': '#a78bfa', 'Bedroom': '#818cf8', 'Living Room': '#34d399',
    'Dining Room': '#fbbf24',    'Kitchen': '#fb923c',  'Bathroom': '#38bdf8',
    'Toilet': '#7dd3fc',         'Balcony': '#86efac',  'Pooja Room': '#f9a8d4',
    'Study Room': '#c084fc',     'Store Room': '#9ca3af','Garage': '#6b7280',
    'Lobby': '#e2e8f0',          'Staircase': '#fde68a'
  };

  // Add room panel
  newRoom: { type: RoomType; width: number; depth: number } =
    { type: 'Bedroom', width: 3.6, depth: 3.6 };

  private roomCounter   = 1;
  private columnCounter = 1;
  private windowCounter = 1;
  private doorCounter   = 1;

  // 2D placement mode: 'move' = drag rooms, 'column' = click to place column, 'window' = click wall to place window, 'door' = click wall to place door, 'delete' = click item to remove
  placeMode: 'move' | 'column' | 'window' | 'door' | 'delete' = 'move';

  // 2D drag-and-drop state
  private dragRoom: Room | null = null;
  private dragOffsetX = 0;   // metres from room.x to click point
  private dragOffsetY = 0;   // metres from room.y to click point
  private hoveredRoomId: number | null = null;

  // Canvas layout constants (must match _draw2D)
  private readonly OX = 40;
  private readonly OY = 20;

  // 3D
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animId = 0;
  private isDragging = false;
  private prevMouse = { x: 0, y: 0 };
  private cameraTheta = 45;
  private cameraPhi   = 55;
  private cameraRadius = 40;

  // Floor-by-floor 3D visibility
  activeFloor3D: number | 'all' = 'all';
  private floor3DMeshes: Map<number, THREE.Object3D[]> = new Map();

  // Camera tour
  tourActive = false;
  tourPaused = false;
  tourT = 0;
  private tourSpeed = 0.0008;
  private tourAnimId = 0;

  // ── Save / Load ──────────────────────────────────────────────────────────
  showSaveModal  = false;
  showLoadModal  = false;
  designName     = '';
  currentDesignId: number | null = null;
  savedDesigns: { id: number; name: string; projectId?: number; updatedAt?: string; createdAt: string }[] = [];
  saveMsg  = '';
  saveErr  = '';
  saveLoading = false;

  // Ollama AI suggestion
  aiLoading = false;
  aiSuggestion = '';
  ollamaEndpoint = API_URLS.AI_CHAT;

  // Scale for 2D canvas: pixels per metre
  readonly SCALE = 25;
  readonly WALL_COLOR = '#1a1f2e';
  readonly GRID_COLOR = '#2d3748';
  readonly SETBACK_COLOR = 'rgba(247,201,72,0.08)';

  // ── Vastu Rules ──────────────────────────────────────────────────────────
  // Vastu Shastra room placement zones — based on traditional Indian Vastu principles.
  // Each entry lists the preferred compass zones for that room type in order of preference.
  readonly VASTU_IDEAL: Record<RoomType, string[]> = {
    'Master Bedroom': ['SW', 'S', 'W'],        // SW = Nairrutya (Earth) — stability & rest for head of family
    'Bedroom':        ['S', 'W', 'NW'],         // NW for guests/children; S & W for family bedrooms
    'Living Room':    ['N', 'NE', 'E'],         // Open, light-filled north or east zones for social spaces
    'Dining Room':    ['W', 'E', 'SE'],         // West is ideal; SE adjacent to kitchen works well
    'Kitchen':        ['SE', 'E'],              // SE = Agni (Fire) corner — strongly recommended for cooking
    'Bathroom':       ['E', 'N', 'NW'],         // East for bathing (morning sun); NE is Ishanya — avoid for wet areas
    'Toilet':         ['NW', 'W', 'S'],         // NW is Vayu (Air) — ideal for toilets; avoid NE & centre
    'Balcony':        ['N', 'E', 'NE'],         // North and east for morning light and positive energy
    'Pooja Room':     ['NE', 'N', 'E'],         // NE = Ishanya — the most sacred, spiritually charged zone
    'Study Room':     ['NE', 'N', 'E', 'W'],   // NE & N for concentration; W acceptable for students
    'Store Room':     ['SW', 'W', 'S', 'NW'],  // SW for heavy storage; NW for lighter/short-term stores
    'Garage':         ['SE', 'NW', 'SW'],       // SE & NW both acceptable; avoid main entry zones
    'Lobby':          ['N', 'NE', 'E'],         // Entrance lobby: north & east attract positive energy
    'Staircase':      ['S', 'SW', 'W', 'SE']   // Clockwise rising preferred; never in NE or centre of plot
  };

  constructor(private cdr: ChangeDetectorRef, private http: HttpClient) {}

  ngOnInit() {
    this.initFloors();
    this.loadDesignList();
  }

  // ── Save / Load ──────────────────────────────────────────────────────────

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  loadDesignList(): void {
    this.http.get<any[]>(API_URLS.FLOOR_PLANS, { headers: this.authHeaders() }).subscribe({
      next:  list => this.savedDesigns = list,
      error: ()   => {}
    });
  }

  openSaveModal(): void {
    this.saveMsg = '';
    this.saveErr = '';
    this.designName = this.designName || 'My Floor Plan';
    this.showSaveModal = true;
  }

  saveDesign(): void {
    if (!this.designName.trim()) { this.saveErr = 'Please enter a design name.'; return; }
    this.saveLoading = true;
    this.saveErr = '';
    const body = {
      name:       this.designName.trim(),
      designJson: JSON.stringify({ site: this.site, floors: this.floors }),
      projectId:  null
    };

    const req = this.currentDesignId
      ? this.http.put<any>(`${API_URLS.FLOOR_PLANS}/${this.currentDesignId}`, body, { headers: this.authHeaders() })
      : this.http.post<any>(API_URLS.FLOOR_PLANS, body, { headers: this.authHeaders() });

    req.subscribe({
      next: res => {
        this.saveLoading    = false;
        this.currentDesignId = res.id;
        this.saveMsg        = this.currentDesignId ? 'Design updated!' : 'Design saved!';
        this.showSaveModal  = false;
        this.loadDesignList();
        setTimeout(() => this.saveMsg = '', 3000);
      },
      error: () => {
        this.saveLoading = false;
        this.saveErr = 'Failed to save. Please try again.';
      }
    });
  }

  loadDesign(id: number): void {
    this.http.get<any>(`${API_URLS.FLOOR_PLANS}/${id}`, { headers: this.authHeaders() }).subscribe({
      next: res => {
        try {
          const data = JSON.parse(res.designJson);
          this.site   = data.site;
          this.floors = data.floors;
          this.currentDesignId = res.id;
          this.designName      = res.name;
          this.showLoadModal   = false;
          this.saveMsg = `Loaded: ${res.name}`;
          setTimeout(() => this.saveMsg = '', 3000);
          this.draw2D();
          if (this.activeView === '3d') this.init3D();
        } catch {
          this.saveErr = 'Failed to parse saved design.';
        }
      },
      error: () => this.saveErr = 'Failed to load design.'
    });
  }

  deleteDesign(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('Delete this saved design?')) return;
    this.http.delete(`${API_URLS.FLOOR_PLANS}/${id}`, { headers: this.authHeaders() }).subscribe({
      next: () => {
        if (this.currentDesignId === id) this.currentDesignId = null;
        this.loadDesignList();
      }
    });
  }

  ngAfterViewInit() {
    this.draw2D();
    // 3D and elevation initialised lazily when tab changes
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animId);
    this.renderer?.dispose();
  }

  // ── Floor management ──────────────────────────────────────────────────────

  initFloors() {
    this.floors = [];
    for (let i = 0; i < this.site.floors; i++) {
      this.floors.push({ floorNumber: i, rooms: [], columns: [], windows: [], doors: [] });
    }
    this.activeFloor = 0;
  }

  onFloorsChange() {
    const current = this.floors.length;
    const target  = this.site.floors;
    if (target > current) {
      for (let i = current; i < target; i++)
        this.floors.push({ floorNumber: i, rooms: [], columns: [], windows: [], doors: [] });
    } else {
      this.floors = this.floors.slice(0, target);
    }
    if (this.activeFloor >= target) this.activeFloor = target - 1;
    this.draw2D();
  }

  get currentFloor(): FloorConfig { return this.floors[this.activeFloor]; }

  // ── Room management ───────────────────────────────────────────────────────

  addRoom() {
    const buildableW = this.site.plotWidth  - this.site.setbacks.east  - this.site.setbacks.west;
    const buildableD = this.site.plotDepth  - this.site.setbacks.north - this.site.setbacks.south;

    this.currentFloor.rooms.push({
      id:    this.roomCounter++,
      name:  this.newRoom.type,
      type:  this.newRoom.type,
      width: Math.min(this.newRoom.width, buildableW),
      depth: Math.min(this.newRoom.depth, buildableD),
      x:     this.site.setbacks.west,
      y:     this.site.setbacks.south,
      color: this.ROOM_COLORS[this.newRoom.type]
    });
    this.draw2D();
  }

  removeRoom(id: number) {
    this.currentFloor.rooms = this.currentFloor.rooms.filter(r => r.id !== id);
    this.draw2D();
  }

  /** Rotate any room 90°: swaps width ↔ depth and toggles the rotated flag (used for Staircase direction). */
  rotateRoom(room: Room) {
    [room.width, room.depth] = [room.depth, room.width];
    room.rotated = !room.rotated;
    this.updateRoom(room);
  }

  updateRoom(room: Room) {
    // clamp to buildable area
    const maxW = this.site.plotWidth  - room.x - this.site.setbacks.east;
    const maxD = this.site.plotDepth  - room.y - this.site.setbacks.north;
    room.width = Math.max(1, Math.min(room.width, maxW));
    room.depth = Math.max(1, Math.min(room.depth, maxD));
    this.draw2D();
  }

  moveRoom(room: Room, dx: number, dy: number) {
    room.x = Math.max(this.site.setbacks.west,
               Math.min(room.x + dx, this.site.plotWidth - this.site.setbacks.east - room.width));
    room.y = Math.max(this.site.setbacks.south,
               Math.min(room.y + dy, this.site.plotDepth - this.site.setbacks.north - room.depth));
    this.draw2D();
  }

  totalBuiltArea(): number {
    return this.currentFloor.rooms.reduce((s, r) => s + r.width * r.depth, 0);
  }

  buildableArea(): number {
    return (this.site.plotWidth  - this.site.setbacks.east  - this.site.setbacks.west) *
           (this.site.plotDepth  - this.site.setbacks.north - this.site.setbacks.south);
  }

  // ── 2D Drag & Drop ────────────────────────────────────────────────────────

  /** Convert canvas pixel coords → room-space coords (Y=0 at south, increases north) */
  private pxToRoom(canvasX: number, canvasY: number) {
    return {
      x: (canvasX - this.OX) / this.SCALE,
      y: this.site.plotDepth - (canvasY - this.OY) / this.SCALE
    };
  }

  /** Return the topmost room under (canvasX, canvasY), or null */
  private roomAt(canvasX: number, canvasY: number): Room | null {
    const rooms = this.currentFloor?.rooms ?? [];
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      const rx = this.OX + r.x * this.SCALE;
      const ry = this.OY + (this.site.plotDepth - r.y - r.depth) * this.SCALE;
      const rw = r.width * this.SCALE;
      const rh = r.depth * this.SCALE;
      if (canvasX >= rx && canvasX <= rx + rw && canvasY >= ry && canvasY <= ry + rh) return r;
    }
    return null;
  }

  /** Clamp and snap a room position to the buildable grid. Snap = 0.5m or ~0.3048m for ft */
  private clampRoom(room: Room, newX: number, newY: number) {
    const sb = this.site.setbacks;
    const snapVal = this.unit === 'ft' ? 1 / this.FT : 0.5; // 0.3048m when in ft
    const snap = (v: number) => Math.round(v / snapVal) * snapVal;
    room.x = snap(Math.max(sb.west,  Math.min(newX, this.site.plotWidth  - sb.east  - room.width)));
    room.y = snap(Math.max(sb.south, Math.min(newY, this.site.plotDepth - sb.north - room.depth)));
  }

  onCanvasMouseDown(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (this.placeMode === 'column') {
      e.preventDefault();
      this.placeColumn(cx, cy);
      return;
    }
    if (this.placeMode === 'window') {
      e.preventDefault();
      this.placeWindow(cx, cy);
      return;
    }
    if (this.placeMode === 'door') {
      e.preventDefault();
      this.placeDoor(cx, cy);
      return;
    }
    if (this.placeMode === 'delete') {
      e.preventDefault();
      this.deleteItemAt(cx, cy);
      return;
    }

    // Default: drag-and-drop
    const hit = this.roomAt(cx, cy);
    if (!hit) return;
    e.preventDefault();
    this.dragRoom = hit;
    const pt = this.pxToRoom(cx, cy);
    this.dragOffsetX = pt.x - hit.x;
    this.dragOffsetY = pt.y - hit.y - hit.depth;
  }

  // ── Column placement ────────────────────────────────────────────────────────

  private placeColumn(cx: number, cy: number) {
    const snap = this.unit === 'ft' ? 1 / this.FT : 0.5;
    const pt   = this.pxToRoom(cx, cy);
    const sx   = Math.round(pt.x / snap) * snap;
    const sy   = Math.round(pt.y / snap) * snap;
    // Clamp within plot
    if (sx < 0 || sy < 0 || sx > this.site.plotWidth || sy > this.site.plotDepth) return;
    this.currentFloor.columns.push({
      id: this.columnCounter++,
      x: sx, y: sy, size: 0.3
    });
    this.draw2D();
  }

  // ── Window placement ────────────────────────────────────────────────────────
  // Detects which room wall the click is nearest to and places a window on it.

  private placeWindow(cx: number, cy: number) {
    const S   = this.SCALE;
    const OX  = this.OX;
    const OY  = this.OY;
    const HIT = 10; // px tolerance to detect a wall

    for (const room of this.currentFloor.rooms) {
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;

      // Check all 4 walls; pick the closest one within HIT pixels
      const walls: { wall: 'N'|'S'|'E'|'W'; dist: number; offset: number }[] = [
        // South wall (bottom of canvas, y = ry+rh)
        { wall: 'S', dist: Math.abs(cy - (ry + rh)), offset: (cx - rx) / S },
        // North wall (top of canvas, y = ry)
        { wall: 'N', dist: Math.abs(cy - ry),        offset: (cx - rx) / S },
        // West wall (left, x = rx)
        { wall: 'W', dist: Math.abs(cx - rx),        offset: (ry + rh - cy) / S },
        // East wall (right, x = rx+rw)
        { wall: 'E', dist: Math.abs(cx - (rx + rw)), offset: (ry + rh - cy) / S },
      ];

      const best = walls.filter(w => w.dist <= HIT && w.offset >= 0)
                        .sort((a, b) => a.dist - b.dist)[0];
      if (!best) continue;

      const wallLength = (best.wall === 'N' || best.wall === 'S') ? room.width : room.depth;
      const winW = Math.min(1.2, wallLength * 0.4);
      const offset = Math.max(0.1, Math.min(best.offset - winW / 2, wallLength - winW - 0.1));

      this.currentFloor.windows.push({
        id: this.windowCounter++,
        roomId: room.id,
        wall: best.wall,
        offset,
        width: winW
      });
      this.draw2D();
      return; // one window per click
    }
  }

  // ── Door placement ─────────────────────────────────────────────────────────
  // Detects which room wall the click is nearest to and places a door on it.

  private placeDoor(cx: number, cy: number) {
    const S   = this.SCALE;
    const OX  = this.OX;
    const OY  = this.OY;
    const HIT = 10;

    for (const room of this.currentFloor.rooms) {
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;

      const walls: { wall: 'N'|'S'|'E'|'W'; dist: number; offset: number }[] = [
        { wall: 'S', dist: Math.abs(cy - (ry + rh)), offset: (cx - rx) / S },
        { wall: 'N', dist: Math.abs(cy - ry),        offset: (cx - rx) / S },
        { wall: 'W', dist: Math.abs(cx - rx),        offset: (ry + rh - cy) / S },
        { wall: 'E', dist: Math.abs(cx - (rx + rw)), offset: (ry + rh - cy) / S },
      ];

      const best = walls.filter(w => w.dist <= HIT && w.offset >= 0)
                        .sort((a, b) => a.dist - b.dist)[0];
      if (!best) continue;

      const wallLength = (best.wall === 'N' || best.wall === 'S') ? room.width : room.depth;
      const doorW = Math.min(0.9, wallLength * 0.35);
      const offset = Math.max(0.1, Math.min(best.offset - doorW / 2, wallLength - doorW - 0.1));

      this.currentFloor.doors.push({
        id:        this.doorCounter++,
        roomId:    room.id,
        wall:      best.wall,
        offset,
        width:     doorW,
        hingeLeft: true
      });
      this.draw2D();
      return; // one door per click
    }
  }

  // ── Delete item at canvas position ──────────────────────────────────────────

  private deleteItemAt(cx: number, cy: number) {
    const S  = this.SCALE;
    const OX = this.OX;
    const OY = this.OY;

    // Try columns first
    const col = this.currentFloor.columns.find(c => {
      const px = OX + c.x * S;
      const py = OY + (this.site.plotDepth - c.y) * S;
      return Math.abs(cx - px) <= 10 && Math.abs(cy - py) <= 10;
    });
    if (col) {
      this.currentFloor.columns = this.currentFloor.columns.filter(c => c.id !== col.id);
      this.draw2D();
      return;
    }

    // Try windows
    const HIT = 10;
    for (let i = this.currentFloor.windows.length - 1; i >= 0; i--) {
      const w = this.currentFloor.windows[i];
      const room = this.currentFloor.rooms.find(r => r.id === w.roomId);
      if (!room) continue;
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;

      let midX = 0, midY = 0;
      switch (w.wall) {
        case 'S': midX = rx + (w.offset + w.width/2)*S; midY = ry + rh; break;
        case 'N': midX = rx + (w.offset + w.width/2)*S; midY = ry; break;
        case 'W': midX = rx; midY = ry + rh - (w.offset + w.width/2)*S; break;
        case 'E': midX = rx + rw; midY = ry + rh - (w.offset + w.width/2)*S; break;
      }
      if (Math.abs(cx - midX) <= HIT && Math.abs(cy - midY) <= HIT) {
        this.currentFloor.windows.splice(i, 1);
        this.draw2D();
        return;
      }
    }

    // Try doors
    for (let i = this.currentFloor.doors.length - 1; i >= 0; i--) {
      const d = this.currentFloor.doors[i];
      const room = this.currentFloor.rooms.find(r => r.id === d.roomId);
      if (!room) continue;
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;

      let midX = 0, midY = 0;
      switch (d.wall) {
        case 'S': midX = rx + (d.offset + d.width/2)*S; midY = ry + rh; break;
        case 'N': midX = rx + (d.offset + d.width/2)*S; midY = ry; break;
        case 'W': midX = rx; midY = ry + rh - (d.offset + d.width/2)*S; break;
        case 'E': midX = rx + rw; midY = ry + rh - (d.offset + d.width/2)*S; break;
      }
      if (Math.abs(cx - midX) <= HIT && Math.abs(cy - midY) <= HIT) {
        this.currentFloor.doors.splice(i, 1);
        this.draw2D();
        return;
      }
    }
  }

  onCanvasMouseMove(e: MouseEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect   = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Update cursor based on active mode
    if (this.placeMode === 'column') { canvas.style.cursor = 'crosshair'; return; }
    if (this.placeMode === 'window') { canvas.style.cursor = 'cell';      return; }
    if (this.placeMode === 'door')   { canvas.style.cursor = 'cell';      return; }
    if (this.placeMode === 'delete') { canvas.style.cursor = 'not-allowed'; return; }

    if (this.dragRoom) {
      e.preventDefault();
      const pt   = this.pxToRoom(cx, cy);
      const newX = pt.x - this.dragOffsetX;
      const newY = pt.y - this.dragOffsetY - this.dragRoom.depth;
      this.clampRoom(this.dragRoom, newX, newY);
      this.draw2D();
    } else {
      const hovered = this.roomAt(cx, cy);
      const newId   = hovered?.id ?? null;
      if (newId !== this.hoveredRoomId) {
        this.hoveredRoomId = newId;
        canvas.style.cursor = hovered ? 'grab' : 'default';
        this.draw2D();
      }
    }
  }

  onCanvasMouseUp(e: MouseEvent | TouchEvent) {
    if (this.dragRoom) {
      this.dragRoom = null;
      this.draw2D();
    }
  }

  onCanvasTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const t    = e.touches[0];
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cx = t.clientX - rect.left;
    const cy = t.clientY - rect.top;
    const hit = this.roomAt(cx, cy);
    if (!hit) return;
    e.preventDefault();
    this.dragRoom = hit;
    const pt = this.pxToRoom(cx, cy);
    this.dragOffsetX = pt.x - hit.x;
    this.dragOffsetY = pt.y - hit.y - hit.depth;
  }

  onCanvasTouchMove(e: TouchEvent) {
    if (!this.dragRoom || e.touches.length !== 1) return;
    e.preventDefault();
    const t    = e.touches[0];
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cx = t.clientX - rect.left;
    const cy = t.clientY - rect.top;
    const pt = this.pxToRoom(cx, cy);
    const newX = pt.x - this.dragOffsetX;
    const newY = pt.y - this.dragOffsetY - this.dragRoom.depth;
    this.clampRoom(this.dragRoom, newX, newY);
    this.draw2D();
  }

  // ── 2D Canvas ─────────────────────────────────────────────────────────────

  draw2D() {
    requestAnimationFrame(() => this._draw2D());
  }

  private _draw2D() {
    const canvas = this.canvas2dRef?.nativeElement;
    if (!canvas) return;
    const S = this.SCALE;
    const W = Math.round(this.site.plotWidth  * S) + 80;
    const H = Math.round(this.site.plotDepth  * S) + 100;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const OX = 40;  // origin X offset
    const OY = 20;  // origin Y offset (top)

    // ── Background grid
    ctx.strokeStyle = this.GRID_COLOR;
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= this.site.plotWidth; x++) {
      ctx.beginPath(); ctx.moveTo(OX + x*S, OY); ctx.lineTo(OX + x*S, OY + this.site.plotDepth*S); ctx.stroke();
    }
    for (let y = 0; y <= this.site.plotDepth; y++) {
      ctx.beginPath(); ctx.moveTo(OX, OY + y*S); ctx.lineTo(OX + this.site.plotWidth*S, OY + y*S); ctx.stroke();
    }

    // ── Plot boundary
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth   = 3;
    ctx.strokeRect(OX, OY, this.site.plotWidth*S, this.site.plotDepth*S);

    // ── Setback hatching
    const sb = this.site.setbacks;
    ctx.fillStyle = this.SETBACK_COLOR;
    // North
    ctx.fillRect(OX, OY, this.site.plotWidth*S, sb.north*S);
    // South
    ctx.fillRect(OX, OY + (this.site.plotDepth - sb.south)*S, this.site.plotWidth*S, sb.south*S);
    // East
    ctx.fillRect(OX + (this.site.plotWidth - sb.east)*S, OY + sb.north*S,
                 sb.east*S, (this.site.plotDepth - sb.north - sb.south)*S);
    // West
    ctx.fillRect(OX, OY + sb.north*S, sb.west*S, (this.site.plotDepth - sb.north - sb.south)*S);

    // ── Setback dotted boundary
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#f7c94880';
    ctx.lineWidth   = 1;
    ctx.strokeRect(
      OX + sb.west*S,
      OY + sb.north*S,
      (this.site.plotWidth - sb.east - sb.west)*S,
      (this.site.plotDepth - sb.north - sb.south)*S
    );
    ctx.setLineDash([]);

    // ── Setback dimension labels (use display units)
    ctx.fillStyle = '#f7c948';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    // North setback
    ctx.fillText(`N ${this.toD(sb.north).toFixed(1)}${this.uL}`, OX + this.site.plotWidth*S/2, OY + sb.north*S/2 + 4);
    // South setback
    ctx.fillText(`S ${this.toD(sb.south).toFixed(1)}${this.uL}`, OX + this.site.plotWidth*S/2, OY + (this.site.plotDepth - sb.south/2)*S + 4);
    // West setback
    ctx.save(); ctx.translate(OX + sb.west*S/2, OY + this.site.plotDepth*S/2);
    ctx.rotate(-Math.PI/2); ctx.fillText(`W ${this.toD(sb.west).toFixed(1)}${this.uL}`, 0, 0); ctx.restore();
    // East setback
    ctx.save(); ctx.translate(OX + (this.site.plotWidth - sb.east/2)*S, OY + this.site.plotDepth*S/2);
    ctx.rotate(-Math.PI/2); ctx.fillText(`E ${this.toD(sb.east).toFixed(1)}${this.uL}`, 0, 0); ctx.restore();

    // ── Rooms
    for (const room of this.currentFloor.rooms) {
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;

      const isDragged = this.dragRoom?.id === room.id;
      const isHovered = !isDragged && this.hoveredRoomId === room.id;

      // ── AutoCAD-style double-line walls ──────────────────────────
      const WT_PX = Math.max(4, Math.min(8, S * 0.22)); // wall thickness in pixels (~5.5 px at 25px/m)

      // Shadow for dragged room
      if (isDragged) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
      }

      // 1. Wall area — dark fill behind hatch
      ctx.fillStyle = '#1a2030';
      ctx.fillRect(rx, ry, rw, rh);

      // 2. Diagonal cross-hatch clipped to wall strip (outer rect minus interior rect — even-odd rule)
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);                                             // outer boundary
      ctx.rect(rx + WT_PX, ry + WT_PX, rw - 2 * WT_PX, rh - 2 * WT_PX); // inner boundary
      ctx.clip('evenodd');
      ctx.strokeStyle = 'rgba(80,105,148,0.9)'; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let d = -(rh + 4); d < rw + rh + 4; d += 5) {
        ctx.moveTo(rx + d, ry); ctx.lineTo(rx + d + rh, ry + rh);
      }
      ctx.stroke();
      ctx.restore();

      // Reset shadow
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

      // 3. Room interior fill (over hatch)
      ctx.fillStyle = room.color + (isDragged ? 'cc' : 'aa');
      ctx.fillRect(rx + WT_PX, ry + WT_PX, rw - 2 * WT_PX, rh - 2 * WT_PX);

      // 4. Outer wall line — heavy architectural weight
      if (isDragged) {
        ctx.setLineDash([6, 3]); ctx.strokeStyle = '#f7c948'; ctx.lineWidth = 2.5;
      } else if (isHovered) {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = '#0f1117'; ctx.lineWidth = 2;
      }
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      // 5. Inner wall line — medium weight (inner face of wall)
      if (rw > WT_PX * 2 + 6 && rh > WT_PX * 2 + 6) {
        ctx.strokeStyle = 'rgba(15,17,23,0.55)'; ctx.lineWidth = 0.8;
        ctx.strokeRect(rx + WT_PX, ry + WT_PX, rw - 2 * WT_PX, rh - 2 * WT_PX);
      }

      // 6. AutoCAD-style dimension ticks for rooms ≥ 50 px wide / tall
      if (!isDragged && rw >= 50 && rh >= 50) {
        ctx.save();
        const ac = '#4a90c4';
        ctx.strokeStyle = ac; ctx.fillStyle = ac; ctx.lineWidth = 0.7;
        ctx.font = '7px monospace'; ctx.textAlign = 'center';

        // Width dim below room
        const dimY = ry + rh + 9;
        ctx.beginPath();
        ctx.moveTo(rx,      ry + rh + 2); ctx.lineTo(rx,      dimY + 5);
        ctx.moveTo(rx + rw, ry + rh + 2); ctx.lineTo(rx + rw, dimY + 5);
        ctx.moveTo(rx + 4,  dimY); ctx.lineTo(rx + rw - 4, dimY);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx,      dimY); ctx.lineTo(rx + 5,      dimY - 3); ctx.lineTo(rx + 5,      dimY + 3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(rx + rw, dimY); ctx.lineTo(rx + rw - 5, dimY - 3); ctx.lineTo(rx + rw - 5, dimY + 3); ctx.closePath(); ctx.fill();
        ctx.textBaseline = 'top';
        ctx.fillText(`${this.toD(room.width).toFixed(1)}${this.uL}`, rx + rw / 2, dimY + 2);

        // Depth dim right of room
        const dimX = rx + rw + 9;
        ctx.beginPath();
        ctx.moveTo(rx + rw + 2, ry);      ctx.lineTo(dimX + 5, ry);
        ctx.moveTo(rx + rw + 2, ry + rh); ctx.lineTo(dimX + 5, ry + rh);
        ctx.moveTo(dimX, ry + 4); ctx.lineTo(dimX, ry + rh - 4);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dimX, ry);      ctx.lineTo(dimX - 3, ry + 5);      ctx.lineTo(dimX + 3, ry + 5);      ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(dimX, ry + rh); ctx.lineTo(dimX - 3, ry + rh - 5); ctx.lineTo(dimX + 3, ry + rh - 5); ctx.closePath(); ctx.fill();
        ctx.save();
        ctx.translate(dimX + 3, ry + rh / 2); ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(`${this.toD(room.depth).toFixed(1)}${this.uL}`, 0, 0);
        ctx.restore();

        ctx.restore();
      }

      // ── Furniture symbols ─────────────────────────────────────
      this.drawFurniture2D(ctx, room, rx, ry, rw, rh);

      // ── Master Bedroom: auto attached en-suite bathroom ───────
      if (room.type === 'Master Bedroom' && rw >= 70 && rh >= 70) {
        const bW = Math.min(rw * 0.33, 52);
        const bH = Math.min(rh * 0.36, 52);
        const bX = rx + rw - bW;
        const bY = ry + rh - bH;

        // Partition walls (dashed)
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(bX, ry + rh); ctx.lineTo(bX, bY);   // vertical partition
        ctx.moveTo(bX, bY);      ctx.lineTo(rx + rw, bY); // horizontal partition
        ctx.stroke();
        ctx.setLineDash([]);

        // Door gap in vertical partition
        const dgap = Math.min(13, bH * 0.35);
        const dgapY = bY + bH * 0.55;
        ctx.fillStyle = room.color + 'bb';
        ctx.fillRect(bX - 1, dgapY - dgap / 2, 3, dgap);
        // Door leaf arc for en-suite
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(bX, dgapY + dgap / 2, dgap, -Math.PI / 2, 0); ctx.stroke();

        // "En Suite" label
        ctx.fillStyle    = '#1e293b';
        ctx.font         = `bold ${Math.max(7, Math.min(9, bW / 6))}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('En Suite', bX + bW / 2, bY + 3);

        // Toilet (oval + tank) in SE corner of en-suite
        const tW = bW * 0.4;
        const tH = bH * 0.4;
        const tX = bX + bW - tW - 3;
        const tY = bY + bH - tH - 3;
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(tX + tW / 2, tY + tH * 0.62, tW * 0.38, tH * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeRect(tX + tW * 0.1, tY, tW * 0.8, tH * 0.22);

        // Washbasin (rectangle + circle) in SW of en-suite
        const wbW = bW * 0.34;
        const wbH = bH * 0.28;
        const wbX = bX + 3;
        const wbY = bY + bH - wbH - 3;
        ctx.strokeRect(wbX, wbY, wbW, wbH);
        ctx.beginPath(); ctx.arc(wbX + wbW / 2, wbY + wbH / 2, Math.min(wbW, wbH) * 0.28, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      // Drag indicator icon
      if (isHovered) {
        ctx.fillStyle   = '#3b82f6';
        ctx.font        = '10px Arial';
        ctx.textAlign   = 'right';
        ctx.textBaseline= 'top';
        ctx.fillText('⤢', rx + rw - 2, ry + 2);
      }

      // Room label
      ctx.fillStyle   = '#0f1117';
      ctx.font        = `bold ${Math.max(8, Math.min(13, rw / room.name.length * 1.5))}px Arial`;
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillText(room.name, rx + rw/2, ry + rh/2 - 8, rw - 4);
      ctx.font        = '9px monospace';
      ctx.fillText(`${this.toD(room.width).toFixed(1)}×${this.toD(room.depth).toFixed(1)}${this.uL}`, rx + rw/2, ry + rh/2 + 8, rw - 4);

      // Coordinates shown while dragging
      if (isDragged) {
        ctx.fillStyle   = '#f7c948';
        ctx.font        = 'bold 9px monospace';
        ctx.textAlign   = 'center';
        ctx.textBaseline= 'bottom';
        ctx.fillText(`(${this.toD(room.x).toFixed(1)}, ${this.toD(room.y).toFixed(1)})`, rx + rw/2, ry - 2);
      }

      // ── Vastu indicator dot (top-right corner of room)
      const vstatus = this.vastuStatus(room);
      const dotColor = vstatus === 'good' ? '#22c55e' : vstatus === 'warn' ? '#eab308' : '#ef4444';
      const dotR = 5;
      ctx.beginPath();
      ctx.arc(rx + rw - dotR - 2, ry + dotR + 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Plot dimensions (use display units)
    ctx.fillStyle   = '#94a3b8';
    ctx.font        = '11px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'alphabetic';
    ctx.fillText(`${this.toD(this.site.plotWidth).toFixed(1)} ${this.uL}`, OX + this.site.plotWidth*S/2, OY + this.site.plotDepth*S + 20);
    ctx.save();
    ctx.translate(OX - 25, OY + this.site.plotDepth*S/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText(`${this.toD(this.site.plotDepth).toFixed(1)} ${this.uL}`, 0, 0);
    ctx.restore();

    // ── Columns ──────────────────────────────────────────────────────────────
    for (const col of this.currentFloor.columns) {
      const px = OX + col.x * S;
      const py = OY + (this.site.plotDepth - col.y) * S;
      const cs = col.size * S;

      // Filled dark square
      ctx.fillStyle   = '#1a1f2e';
      ctx.fillRect(px - cs/2, py - cs/2, cs, cs);

      // Diagonal cross (standard architectural column symbol)
      ctx.strokeStyle = '#f7c948';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - cs/2, py - cs/2); ctx.lineTo(px + cs/2, py + cs/2);
      ctx.moveTo(px + cs/2, py - cs/2); ctx.lineTo(px - cs/2, py + cs/2);
      ctx.stroke();

      // Outer square border
      ctx.strokeStyle = '#f7c948';
      ctx.lineWidth   = 1;
      ctx.strokeRect(px - cs/2 - 1, py - cs/2 - 1, cs + 2, cs + 2);
    }

    // ── Windows ──────────────────────────────────────────────────────────────
    for (const win of this.currentFloor.windows) {
      const room = this.currentFloor.rooms.find(r => r.id === win.roomId);
      if (!room) continue;

      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width * S;
      const rh = room.depth * S;
      const wPx = win.width * S;    // window width in pixels

      ctx.save();

      switch (win.wall) {
        case 'S': {
          // South wall: bottom edge of room
          const wx = rx + win.offset * S;
          const wy = ry + rh;
          // Erase wall segment (white gap)
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx, wy - 3, wPx, 6);
          // Three parallel horizontal glass lines
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const lx = wx + (wPx * (i + 0.5)) / 3;
            ctx.beginPath(); ctx.moveTo(lx, wy - 4); ctx.lineTo(lx, wy + 4); ctx.stroke();
          }
          // Window frame outline
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
          ctx.strokeRect(wx, wy - 4, wPx, 8);
          break;
        }
        case 'N': {
          const wx = rx + win.offset * S;
          const wy = ry;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx, wy - 3, wPx, 6);
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const lx = wx + (wPx * (i + 0.5)) / 3;
            ctx.beginPath(); ctx.moveTo(lx, wy - 4); ctx.lineTo(lx, wy + 4); ctx.stroke();
          }
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
          ctx.strokeRect(wx, wy - 4, wPx, 8);
          break;
        }
        case 'W': {
          const wy = ry + rh - win.offset * S;  // start from bottom
          const wx = rx;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx - 3, wy - wPx, 6, wPx);
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const ly = wy - wPx + (wPx * (i + 0.5)) / 3;
            ctx.beginPath(); ctx.moveTo(wx - 4, ly); ctx.lineTo(wx + 4, ly); ctx.stroke();
          }
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
          ctx.strokeRect(wx - 4, wy - wPx, 8, wPx);
          break;
        }
        case 'E': {
          const wy = ry + rh - win.offset * S;
          const wx = rx + rw;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx - 3, wy - wPx, 6, wPx);
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const ly = wy - wPx + (wPx * (i + 0.5)) / 3;
            ctx.beginPath(); ctx.moveTo(wx - 4, ly); ctx.lineTo(wx + 4, ly); ctx.stroke();
          }
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
          ctx.strokeRect(wx - 4, wy - wPx, 8, wPx);
          break;
        }
      }

      ctx.restore();
    }

    // ── Doors ─────────────────────────────────────────────────────────────────
    for (const door of this.currentFloor.doors) {
      const room = this.currentFloor.rooms.find(r => r.id === door.roomId);
      if (!room) continue;

      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width  * S;
      const rh = room.depth  * S;
      const dPx = door.width * S;

      ctx.save();

      switch (door.wall) {
        case 'S': {
          const hx = rx + door.offset * S;
          const hy = ry + rh;
          // Opening gap in wall
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(hx, hy - 3, dPx, 6);
          // Door leaf (solid line from hinge going into room)
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - dPx); ctx.stroke();
          // Swing arc (dashed quarter-circle)
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.arc(hx, hy, dPx, -Math.PI / 2, 0); ctx.stroke();
          ctx.setLineDash([]);
          // Hinge dot
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'N': {
          const hx = rx + door.offset * S;
          const hy = ry;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(hx, hy - 3, dPx, 6);
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + dPx); ctx.stroke();
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.arc(hx, hy, dPx, Math.PI / 2, 0, true); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'W': {
          const wy = ry + rh - door.offset * S;
          const wx = rx;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx - 3, wy - dPx, 6, dPx);
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + dPx, wy); ctx.stroke();
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.arc(wx, wy, dPx, -Math.PI, -Math.PI / 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.arc(wx, wy, 2.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'E': {
          const wy = ry + rh - door.offset * S;
          const wx = rx + rw;
          ctx.fillStyle = '#0f1117';
          ctx.fillRect(wx - 3, wy - dPx, 6, dPx);
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx - dPx, wy); ctx.stroke();
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.arc(wx, wy, dPx, 0, -Math.PI / 2, true); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.arc(wx, wy, 2.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
      }

      ctx.restore();
    }

    // ── Placement mode cursor hint ────────────────────────────────────────────
    if (this.placeMode !== 'move') {
      const modeLabel: Record<string, string> = {
        column: '🔲 Click to place column (0.5m snap)',
        window: '🪟 Click near a room wall to place window',
        door:   '🚪 Click near a room wall to place door',
        delete: '🗑️ Click a column, window or door to delete'
      };
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 11px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(modeLabel[this.placeMode] ?? '', OX + this.site.plotWidth*S - 4, OY + 4);
    }

    // ── North compass rose (top-left, inside plot border)
    {
      const ncX = OX + 18; const ncY = OY + 46;
      ctx.save();
      ctx.strokeStyle = '#f7c948'; ctx.fillStyle = '#f7c948'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ncX, ncY, 13, 0, Math.PI * 2); ctx.stroke();
      // North arrow (filled half)
      ctx.beginPath(); ctx.moveTo(ncX, ncY - 12); ctx.lineTo(ncX + 4, ncY); ctx.lineTo(ncX - 4, ncY); ctx.closePath(); ctx.fill();
      // South half (outline only)
      ctx.beginPath(); ctx.moveTo(ncX, ncY + 12); ctx.lineTo(ncX + 4, ncY); ctx.lineTo(ncX - 4, ncY); ctx.closePath(); ctx.stroke();
      // Cardinal ticks
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx2, dy2]) => {
        ctx.beginPath();
        ctx.moveTo(ncX + dx2 * 9, ncY + dy2 * 9);
        ctx.lineTo(ncX + dx2 * 13, ncY + dy2 * 13);
        ctx.stroke();
      });
      ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', ncX, ncY - 19);
      ctx.restore();
    }

    // ── Scale bar (bottom, right of plot)
    {
      const barM   = Math.min(5, Math.round(this.site.plotWidth / 3)); // represents N metres
      const barLen = barM * S;
      const sbX    = OX + this.site.plotWidth * S - barLen - 4;
      const sbY    = OY + this.site.plotDepth * S + 38;
      ctx.save();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
      const segW = barLen / 2;
      ctx.fillStyle = '#64748b'; ctx.fillRect(sbX, sbY - 5, segW, 5);
      ctx.fillStyle = '#1a1f2e'; ctx.fillRect(sbX + segW, sbY - 5, segW, 5);
      ctx.strokeRect(sbX, sbY - 5, barLen, 5);
      ctx.fillStyle = '#94a3b8'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('0', sbX, sbY + 1);
      ctx.fillText(`${this.toD(barM / 2).toFixed(1)}`, sbX + segW, sbY + 1);
      ctx.fillText(`${this.toD(barM).toFixed(1)} ${this.uL}`, sbX + barLen, sbY + 1);
      ctx.textAlign = 'right'; ctx.font = '7px monospace';
      ctx.fillText('1:150 (screen)', sbX + barLen, sbY - 8);
      ctx.restore();
    }

    // ── Facing arrow
    ctx.fillStyle = '#f7c948';
    ctx.font      = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`↑ ${this.site.facing} Facing`, OX + 4, OY + 14);
  }

  // ── 2D Furniture Symbols ──────────────────────────────────────────────────

  private drawFurniture2D(
    ctx: CanvasRenderingContext2D,
    room: Room,
    rx: number, ry: number, rw: number, rh: number
  ) {
    const pad = 0.1; // 10% inset factor
    const ix = rx + rw * pad;
    const iy = ry + rh * pad;
    const iw = rw * (1 - pad * 2);
    const ih = rh * (1 - pad * 2);

    ctx.save();
    ctx.strokeStyle = '#1a1f2e';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';

    switch (room.type) {
      case 'Master Bedroom':
      case 'Bedroom': {
        // Bed rectangle (80% width, 55% depth)
        const bw = iw * 0.8;
        const bd = ih * 0.55;
        const bx = ix + (iw - bw) / 2;
        const by = iy + ih * 0.1;
        ctx.strokeRect(bx, by, bw, bd);
        // Headboard line at top
        ctx.beginPath(); ctx.moveTo(bx, by + 8); ctx.lineTo(bx + bw, by + 8); ctx.stroke();
        // Two pillows (semicircles)
        const pr = Math.min(bw * 0.2, 12);
        ctx.beginPath(); ctx.arc(bx + bw * 0.28, by + 4, pr, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx + bw * 0.72, by + 4, pr, Math.PI, 0); ctx.stroke();
        // Bedside tables
        const ts = Math.min(iw * 0.12, 10);
        ctx.strokeRect(bx - ts - 2, by + bd / 3, ts, ts);
        ctx.strokeRect(bx + bw + 2, by + bd / 3, ts, ts);
        break;
      }
      case 'Living Room': {
        // L-shaped sofa: two rects
        const sw = iw * 0.7;
        const sd = ih * 0.3;
        const sx = ix + (iw - sw) / 2;
        const sy = iy + ih * 0.55;
        ctx.strokeRect(sx, sy, sw, sd);           // main sofa piece
        ctx.strokeRect(sx, iy + ih * 0.3, sd, ih * 0.25); // side arm
        // Coffee table circle
        ctx.beginPath();
        ctx.arc(ix + iw / 2, iy + ih * 0.32, Math.min(iw, ih) * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'Dining Room': {
        // Rectangular table
        const tw = iw * 0.55;
        const td = ih * 0.45;
        const tx = ix + (iw - tw) / 2;
        const ty = iy + (ih - td) / 2;
        ctx.strokeRect(tx, ty, tw, td);
        // 4 chairs (small circles) around table
        const cr = Math.min(tw, td) * 0.1;
        [[tx + tw / 2, ty - cr * 2],
         [tx + tw / 2, ty + td + cr * 2],
         [tx - cr * 2, ty + td / 2],
         [tx + tw + cr * 2, ty + td / 2]].forEach(([cx, cy]) => {
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
        });
        break;
      }
      case 'Kitchen': {
        // Counter L-shape along bottom and left
        const ct = ih * 0.18; // counter thickness
        ctx.strokeRect(ix, iy + ih - ct, iw, ct);          // bottom counter
        ctx.strokeRect(ix, iy, ct, ih - ct);                // left counter
        // Sink (circle on bottom counter)
        ctx.beginPath();
        ctx.arc(ix + iw * 0.35, iy + ih - ct / 2, ct * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        // Stove (rectangle on left counter)
        const sRect = ct * 0.6;
        ctx.strokeRect(ix + ct * 0.1, iy + ih * 0.4, sRect, sRect * 1.2);
        // 4 burner dots
        [[0.25, 0.45], [0.75, 0.45], [0.25, 0.75], [0.75, 0.75]].forEach(([fx, fy]) => {
          ctx.beginPath();
          ctx.arc(ix + ct * 0.1 + sRect * fx, iy + ih * 0.4 + sRect * 1.2 * fy, 2, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        });
        break;
      }
      case 'Bathroom': {
        // Bathtub rectangle on one side
        const btw = iw * 0.45;
        const bth = ih * 0.65;
        ctx.strokeRect(ix, iy + (ih - bth) / 2, btw, bth);
        // Inner oval of tub
        ctx.beginPath();
        ctx.ellipse(ix + btw / 2, iy + ih / 2, btw * 0.35, bth * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Toilet (oval seat + tank rect) on other side
        const tw2 = iw * 0.35;
        const tx2 = ix + iw - tw2;
        const ty2 = iy + ih * 0.2;
        const th2 = ih * 0.55;
        ctx.beginPath(); ctx.ellipse(tx2 + tw2 / 2, ty2 + th2 * 0.55, tw2 * 0.4, th2 * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeRect(tx2 + tw2 * 0.1, ty2, tw2 * 0.8, th2 * 0.22); // tank
        break;
      }
      case 'Toilet': {
        const tw = iw * 0.55;
        const th = ih * 0.7;
        const tx = ix + (iw - tw) / 2;
        const ty = iy + (ih - th) / 2;
        ctx.beginPath(); ctx.ellipse(tx + tw / 2, ty + th * 0.6, tw * 0.4, th * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeRect(tx + tw * 0.1, ty, tw * 0.8, th * 0.25);
        break;
      }
      case 'Balcony': {
        // Railing (double line at bottom = glazed railing)
        ctx.strokeRect(ix, iy + ih * 0.85, iw, ih * 0.12);
        // Glass hatching in railing
        ctx.save(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 0.5;
        for (let hx2 = ix; hx2 < ix + iw; hx2 += 5) {
          ctx.beginPath(); ctx.moveTo(hx2, iy + ih * 0.85); ctx.lineTo(hx2, iy + ih * 0.97); ctx.stroke();
        }
        ctx.restore();
        // Lounge chairs (2 rects)
        if (iw > 40) {
          const cw2 = iw * 0.28; const ch2 = ih * 0.5;
          ctx.strokeRect(ix + iw * 0.1, iy + ih * 0.1, cw2, ch2);
          ctx.strokeRect(ix + iw * 0.62, iy + ih * 0.1, cw2, ch2);
          // Table (circle between chairs)
          ctx.beginPath(); ctx.arc(ix + iw / 2, iy + ih * 0.36, Math.min(iw, ih) * 0.09, 0, Math.PI * 2); ctx.stroke();
        }
        // Potted plant (circle, corner)
        ctx.beginPath(); ctx.arc(ix + iw * 0.88, iy + ih * 0.68, Math.min(iw, ih) * 0.09, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'Pooja Room': {
        // Prayer platform rectangle
        const pw = iw * 0.6;
        const pd2 = ih * 0.4;
        ctx.strokeRect(ix + (iw - pw) / 2, iy + ih * 0.1, pw, pd2);
        // Lamp star at center
        const lx = ix + iw / 2;
        const ly = iy + ih * 0.7;
        const lr = Math.min(iw, ih) * 0.08;
        for (let n = 0; n < 6; n++) {
          const a = (n / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + Math.cos(a) * lr, ly + Math.sin(a) * lr);
          ctx.stroke();
        }
        break;
      }
      case 'Study Room': {
        // L-shaped desk in corner
        const dw = iw * 0.65;
        const dd = ih * 0.2;
        ctx.strokeRect(ix, iy, dw, dd);
        ctx.strokeRect(ix, iy, dd, ih * 0.45);
        // Chair (small rectangle)
        ctx.strokeRect(ix + dw + 4, iy + dd / 2, iw * 0.2, ih * 0.18);
        break;
      }
      case 'Store Room': {
        // Grid of shelf lines
        const cols = 3, rows = 4;
        for (let c = 1; c < cols; c++) {
          const x2 = ix + (iw / cols) * c;
          ctx.beginPath(); ctx.moveTo(x2, iy); ctx.lineTo(x2, iy + ih); ctx.stroke();
        }
        for (let r = 1; r < rows; r++) {
          const y2 = iy + (ih / rows) * r;
          ctx.beginPath(); ctx.moveTo(ix, y2); ctx.lineTo(ix + iw, y2); ctx.stroke();
        }
        break;
      }
      case 'Garage': {
        // Car outline rectangle with 4 circle wheels
        const cw = iw * 0.7;
        const ch = ih * 0.55;
        const cx2 = ix + (iw - cw) / 2;
        const cy2 = iy + (ih - ch) / 2;
        ctx.strokeRect(cx2, cy2, cw, ch);
        const wr = Math.min(cw, ch) * 0.1;
        [[cx2 + wr * 1.2, cy2 + wr * 1.2],
         [cx2 + cw - wr * 1.2, cy2 + wr * 1.2],
         [cx2 + wr * 1.2, cy2 + ch - wr * 1.2],
         [cx2 + cw - wr * 1.2, cy2 + ch - wr * 1.2]].forEach(([wx, wy]) => {
          ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.stroke();
        });
        break;
      }
      case 'Lobby': {
        // Reception desk (L-shape)
        const rdw = iw * 0.55; const rdh = ih * 0.25;
        ctx.strokeRect(ix + (iw - rdw) / 2, iy + ih * 0.25, rdw, rdh);
        ctx.strokeRect(ix + (iw - rdw) / 2 + rdw - rdh * 0.7, iy + ih * 0.25, rdh * 0.7, rdh * 1.4);
        // Waiting chairs row
        const chW2 = iw * 0.17; const chGap = iw * 0.04;
        const nC = Math.min(3, Math.floor(iw / (chW2 + chGap)));
        for (let n = 0; n < nC; n++) {
          ctx.strokeRect(ix + n * (chW2 + chGap), iy + ih * 0.66, chW2, chW2);
        }
        // Potted plant
        ctx.beginPath(); ctx.arc(ix + iw * 0.88, iy + ih * 0.18, Math.min(iw, ih) * 0.09, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'Staircase': {
        // ── Architectural staircase symbol (supports N-S and E-W via room.rotated) ──
        const isRotated = !!room.rotated;

        if (!isRotated) {
          // ── N-S orientation: treads are horizontal lines, UP arrow points north ──
          const steps  = Math.max(5, Math.min(14, Math.floor(ih / 8)));
          const stepH  = ih / steps;
          const cutY   = iy + ih * 0.52;
          const arX    = ix + iw / 2;

          ctx.save(); ctx.strokeStyle = '#4a4a6a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ix + 2,      iy); ctx.lineTo(ix + 2,      iy + ih); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ix + iw - 2, iy); ctx.lineTo(ix + iw - 2, iy + ih); ctx.stroke();
          ctx.restore();

          for (let n = 0; n <= steps; n++) {
            const ly = iy + ih - n * stepH;
            ctx.save();
            if (ly < cutY) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(26,31,46,0.45)'; ctx.lineWidth = 0.8; }
            else            { ctx.setLineDash([]);     ctx.strokeStyle = '#1a1f2e';              ctx.lineWidth = 1;   }
            ctx.beginPath(); ctx.moveTo(ix + 4, ly); ctx.lineTo(ix + iw - 4, ly); ctx.stroke();
            ctx.restore();
          }

          ctx.save(); ctx.strokeStyle = '#1a1f2e'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
          const bzStep = iw / 6;
          ctx.beginPath(); ctx.moveTo(ix, cutY);
          for (let z = 0; z < 6; z++) ctx.lineTo(ix + (z + 0.5) * bzStep, cutY + (z % 2 === 0 ? 5 : -5));
          ctx.lineTo(ix + iw, cutY); ctx.stroke(); ctx.restore();

          ctx.save(); ctx.strokeStyle = '#1a1f2e'; ctx.lineWidth = 1.5;
          const arTip = iy + ih * 0.08; const arBase = cutY - stepH;
          ctx.beginPath(); ctx.moveTo(arX, arBase); ctx.lineTo(arX, arTip);
          ctx.lineTo(arX - iw * 0.09, arTip + ih * 0.07); ctx.moveTo(arX, arTip);
          ctx.lineTo(arX + iw * 0.09, arTip + ih * 0.07); ctx.stroke();
          const fs = Math.max(7, Math.min(11, iw * 0.14));
          ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = '#1a1f2e'; ctx.textAlign = 'center';
          ctx.fillText('UP', arX, arBase + fs + 2);
          ctx.font = `${Math.max(6, fs - 2)}px sans-serif`; ctx.fillStyle = 'rgba(26,31,46,0.6)';
          ctx.fillText(`${steps} steps`, arX, iy + ih - 3); ctx.restore();

        } else {
          // ── E-W orientation: treads are vertical lines, UP arrow points east ──
          const steps  = Math.max(5, Math.min(14, Math.floor(iw / 8)));
          const stepW  = iw / steps;
          const cutX   = ix + iw * 0.52;
          const arY    = iy + ih / 2;

          ctx.save(); ctx.strokeStyle = '#4a4a6a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ix, iy + 2);      ctx.lineTo(ix + iw, iy + 2);      ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ix, iy + ih - 2); ctx.lineTo(ix + iw, iy + ih - 2); ctx.stroke();
          ctx.restore();

          for (let n = 0; n <= steps; n++) {
            const lx = ix + iw - n * stepW;
            ctx.save();
            if (lx > cutX) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(26,31,46,0.45)'; ctx.lineWidth = 0.8; }
            else             { ctx.setLineDash([]);    ctx.strokeStyle = '#1a1f2e';              ctx.lineWidth = 1;   }
            ctx.beginPath(); ctx.moveTo(lx, iy + 4); ctx.lineTo(lx, iy + ih - 4); ctx.stroke();
            ctx.restore();
          }

          ctx.save(); ctx.strokeStyle = '#1a1f2e'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
          const bzStep = ih / 6;
          ctx.beginPath(); ctx.moveTo(cutX, iy);
          for (let z = 0; z < 6; z++) ctx.lineTo(cutX + (z % 2 === 0 ? 5 : -5), iy + (z + 0.5) * bzStep);
          ctx.lineTo(cutX, iy + ih); ctx.stroke(); ctx.restore();

          ctx.save(); ctx.strokeStyle = '#1a1f2e'; ctx.lineWidth = 1.5;
          const arTip2 = ix + iw * 0.92; const arBase2 = cutX + stepW;
          ctx.beginPath(); ctx.moveTo(arBase2, arY); ctx.lineTo(arTip2, arY);
          ctx.lineTo(arTip2 - iw * 0.07, arY - ih * 0.09); ctx.moveTo(arTip2, arY);
          ctx.lineTo(arTip2 - iw * 0.07, arY + ih * 0.09); ctx.stroke();
          const fs2 = Math.max(7, Math.min(11, ih * 0.14));
          ctx.font = `bold ${fs2}px sans-serif`; ctx.fillStyle = '#1a1f2e';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('UP', arBase2 - fs2 * 2.5, arY);
          ctx.font = `${Math.max(6, fs2 - 2)}px sans-serif`; ctx.fillStyle = 'rgba(26,31,46,0.6)';
          ctx.fillText(`${steps} steps`, ix + 20, arY); ctx.restore();
        }
        break;
      }
    }

    ctx.restore();
  }

  // ── Elevation Canvas ──────────────────────────────────────────────────────

  drawElevation() {
    requestAnimationFrame(() => this._drawElevation());
  }

  private _drawElevation() {
    const canvas = this.canvasElevRef?.nativeElement;
    if (!canvas) return;

    const W = 800;
    const totalHeightM = this.site.floors * this.site.floorHeight;
    const SCALE_H = 40; // px per metre height
    const SCALE_W = 25; // px per metre width
    const plotPxW = Math.round(this.site.plotWidth * SCALE_W);
    const H = Math.round(totalHeightM * SCALE_H) + 80; // padding top/bottom
    canvas.width  = plotPxW + 80;
    canvas.height = H;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const OX = 40;
    const groundY = H - 40; // y-pixel where ground is

    // ── Sky gradient background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0,   '#87CEEB');
    skyGrad.addColorStop(0.7, '#b0d8f0');
    skyGrad.addColorStop(1,   '#ffffff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, groundY);

    // ── Ground strip
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
    groundGrad.addColorStop(0, '#5a7a3a');
    groundGrad.addColorStop(0.4, '#7a5c3a');
    groundGrad.addColorStop(1, '#6b4f30');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, canvas.width, H - groundY);

    // ── Building facade
    const buildingPxW = plotPxW;
    const buildingTotalPxH = Math.round(totalHeightM * SCALE_H);
    const buildingX = OX;
    const buildingTopY = groundY - buildingTotalPxH;

    // Wall background
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(buildingX, buildingTopY, buildingPxW, buildingTotalPxH);

    // Wall outline
    ctx.strokeStyle = '#c8bfaa';
    ctx.lineWidth = 2;
    ctx.strokeRect(buildingX, buildingTopY, buildingPxW, buildingTotalPxH);

    // ── Rooms that get windows (facing side)
    const windowRooms: RoomType[] = ['Living Room', 'Bedroom', 'Master Bedroom', 'Kitchen'];
    const smallWindowRooms: RoomType[] = ['Bathroom', 'Toilet'];
    let doorDrawn = false;

    for (let f = 0; f < this.site.floors; f++) {
      const floorConfig = this.floors[f];
      if (!floorConfig) continue;

      const floorBottomY = groundY - (f + 1) * this.site.floorHeight * SCALE_H;
      const floorPxH = this.site.floorHeight * SCALE_H;

      // ── Floor line between storeys
      if (f > 0) {
        ctx.strokeStyle = '#c8bfaa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(buildingX, floorBottomY + floorPxH);
        ctx.lineTo(buildingX + buildingPxW, floorBottomY + floorPxH);
        ctx.stroke();
      }

      // Draw windows for rooms on this floor
      let windowXCursor = buildingX + 10;
      for (const room of floorConfig.rooms) {
        const roomPxW = Math.min(room.width * SCALE_W, buildingPxW - 20);
        const winMargin = 8;
        const winW = Math.max(roomPxW - winMargin * 2, 20);
        const winH = Math.round(floorPxH * 0.4);
        const winY = floorBottomY + Math.round(floorPxH * 0.2);
        const winX = windowXCursor + winMargin;

        if (windowXCursor + roomPxW > buildingX + buildingPxW - 10) break;

        if (windowRooms.includes(room.type)) {
          // Large window
          // Frame
          ctx.fillStyle = '#d4ccc0';
          ctx.fillRect(winX, winY, winW, winH);
          // Glass
          ctx.fillStyle = 'rgba(173,216,230,0.6)';
          ctx.fillRect(winX + 3, winY + 3, winW - 6, winH - 6);
          // Window cross
          ctx.strokeStyle = '#d4ccc0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(winX + winW/2, winY + 3);
          ctx.lineTo(winX + winW/2, winY + winH - 3);
          ctx.moveTo(winX + 3, winY + winH/2);
          ctx.lineTo(winX + winW - 3, winY + winH/2);
          ctx.stroke();
        } else if (smallWindowRooms.includes(room.type)) {
          // Small frosted window
          const sw = Math.max(Math.min(winW, 24), 14);
          const sh = Math.round(winH * 0.6);
          const sx = winX + (winW - sw) / 2;
          const sy = winY + Math.round(floorPxH * 0.1);
          ctx.fillStyle = '#d4ccc0';
          ctx.fillRect(sx, sy, sw, sh);
          ctx.fillStyle = 'rgba(200,220,240,0.5)';
          ctx.fillRect(sx + 2, sy + 2, sw - 4, sh - 4);
        }

        // Ground floor: draw main door at center of Living Room
        if (f === 0 && !doorDrawn && (room.type === 'Living Room' || room.type === 'Lobby')) {
          const doorW = Math.min(36, roomPxW - 10);
          const doorH = Math.round(floorPxH * 0.65);
          const doorX = winX + (winW - doorW) / 2;
          const doorY = groundY - doorH;

          // Door frame
          ctx.fillStyle = '#8b6914';
          ctx.fillRect(doorX - 3, doorY - 3, doorW + 6, doorH + 3);

          // Door panel
          ctx.fillStyle = '#c8930a';
          ctx.fillRect(doorX, doorY, doorW, doorH);

          // Arched top
          ctx.beginPath();
          ctx.arc(doorX + doorW / 2, doorY, doorW / 2, Math.PI, 0);
          ctx.fillStyle = '#c8930a';
          ctx.fill();
          ctx.strokeStyle = '#8b6914';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(doorX + doorW / 2, doorY, doorW / 2, Math.PI, 0);
          ctx.stroke();

          // Door knob
          ctx.beginPath();
          ctx.arc(doorX + doorW * 0.75, groundY - doorH * 0.35, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#f7c948';
          ctx.fill();

          doorDrawn = true;
        }

        windowXCursor += roomPxW;
      }
    }

    // ── Roof: flat parapet
    const parapetH = 12;
    ctx.fillStyle = '#c8bfaa';
    ctx.fillRect(buildingX - 4, buildingTopY - parapetH, buildingPxW + 8, parapetH + 4);
    ctx.strokeStyle = '#a09585';
    ctx.lineWidth = 2;
    ctx.strokeRect(buildingX - 4, buildingTopY - parapetH, buildingPxW + 8, parapetH + 4);

    // ── Dimension labels
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(
      `${this.toD(this.site.plotWidth).toFixed(1)} ${this.uL}`,
      buildingX + buildingPxW / 2,
      H - 8
    );

    ctx.save();
    ctx.translate(OX - 20, buildingTopY + buildingTotalPxH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(
      `${this.toD(totalHeightM).toFixed(1)} ${this.uL}`,
      0, 0
    );
    ctx.restore();

    // ── Facing label
    ctx.fillStyle = '#374151';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this.site.facing} Elevation`, canvas.width - 8, 8);
  }

  // ── Top Elevation (Roof Plan) Canvas ─────────────────────────────────────

  drawTopElevation() {
    requestAnimationFrame(() => this._drawTopElevation());
  }

  private _drawTopElevation() {
    const canvas = this.canvasTopElevRef?.nativeElement;
    if (!canvas) return;

    const S  = this.SCALE;
    const W  = Math.round(this.site.plotWidth  * S) + 100;
    const H  = Math.round(this.site.plotDepth  * S) + 120;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // ── Paper background
    ctx.fillStyle = '#f9f7f2';
    ctx.fillRect(0, 0, W, H);

    // ── Subtle grid
    ctx.strokeStyle = '#e8e2d8';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= this.site.plotWidth; x++) {
      ctx.beginPath(); ctx.moveTo(50 + x*S, 30); ctx.lineTo(50 + x*S, 30 + this.site.plotDepth*S); ctx.stroke();
    }
    for (let y = 0; y <= this.site.plotDepth; y++) {
      ctx.beginPath(); ctx.moveTo(50, 30 + y*S); ctx.lineTo(50 + this.site.plotWidth*S, 30 + y*S); ctx.stroke();
    }

    const OX = 50;
    const OY = 30;
    const sb  = this.site.setbacks;
    const pW  = this.site.plotWidth  * S;
    const pD  = this.site.plotDepth  * S;

    // ── Setback hatch
    ctx.fillStyle = 'rgba(230,220,200,0.55)';
    ctx.fillRect(OX, OY, pW, sb.north * S);
    ctx.fillRect(OX, OY + (this.site.plotDepth - sb.south) * S, pW, sb.south * S);
    ctx.fillRect(OX, OY + sb.north * S, sb.west * S, (this.site.plotDepth - sb.north - sb.south) * S);
    ctx.fillRect(OX + (this.site.plotWidth - sb.east) * S, OY + sb.north * S, sb.east * S, (this.site.plotDepth - sb.north - sb.south) * S);

    // ── Buildable footprint (concrete roof)
    const bx = OX + sb.west * S;
    const by = OY + sb.north * S;
    const bW = (this.site.plotWidth  - sb.east  - sb.west)  * S;
    const bD = (this.site.plotDepth  - sb.north - sb.south) * S;

    // Roof fill
    const roofGrad = ctx.createLinearGradient(bx, by, bx + bW, by + bD);
    roofGrad.addColorStop(0, '#d6cfc4');
    roofGrad.addColorStop(1, '#c8bfaf');
    ctx.fillStyle = roofGrad;
    ctx.fillRect(bx, by, bW, bD);

    // ── Wall thickness hatching (diagonal lines on perimeter)
    const wt = 4; // pixels representing ~0.2m wall
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bW, bD);
    ctx.clip();
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth   = 0.7;
    for (let i = -bD; i < bW + bD; i += 6) {
      ctx.beginPath(); ctx.moveTo(bx + i, by); ctx.lineTo(bx + i + bD, by + bD); ctx.stroke();
    }
    ctx.restore();

    // Parapet outer
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(bx - wt, by - wt, bW + wt*2, wt);          // north
    ctx.fillRect(bx - wt, by + bD, bW + wt*2, wt);          // south
    ctx.fillRect(bx - wt, by - wt, wt, bD + wt*2);          // west
    ctx.fillRect(bx + bW, by - wt, wt, bD + wt*2);          // east
    // Parapet top face (lighter)
    ctx.fillStyle = '#ccc5ba';
    ctx.fillRect(bx, by, bW, wt);
    ctx.fillRect(bx, by + bD - wt, bW, wt);
    ctx.fillRect(bx, by, wt, bD);
    ctx.fillRect(bx + bW - wt, by, wt, bD);

    // ── Room footprints from floor 0
    const rooms = this.floors[0]?.rooms ?? [];
    for (const room of rooms) {
      const rx = OX + room.x * S;
      const ry = OY + (this.site.plotDepth - room.y - room.depth) * S;
      const rw = room.width  * S;
      const rh = room.depth  * S;

      // Room fill
      ctx.fillStyle = room.color + '55';
      ctx.fillRect(rx + wt, ry + wt, rw - wt*2, rh - wt*2);

      // Room border (wall lines)
      ctx.strokeStyle = '#666';
      ctx.lineWidth   = 1;
      ctx.strokeRect(rx + wt, ry + wt, rw - wt*2, rh - wt*2);

      // Room label
      ctx.fillStyle   = '#333';
      const fontSize  = Math.max(8, Math.min(11, rw / room.name.length * 1.4));
      ctx.font        = `bold ${fontSize}px Arial`;
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillText(room.name, rx + rw/2, ry + rh/2 - 6, rw - 8);

      // Dimension
      ctx.fillStyle = '#888';
      ctx.font      = '8px monospace';
      ctx.fillText(`${this.toD(room.width).toFixed(1)}×${this.toD(room.depth).toFixed(1)}${this.uL}`, rx + rw/2, ry + rh/2 + 7, rw - 8);
    }

    // ── Parapet shadow line
    ctx.strokeStyle = '#9c9488';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(bx - wt, by - wt, bW + wt*2, bD + wt*2);

    // ── Plot boundary
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth   = 2.5;
    ctx.strokeRect(OX, OY, pW, pD);

    // ── Setback boundary (dashed)
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#f7a500';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bW, bD);
    ctx.setLineDash([]);

    // ── Dimension labels
    ctx.fillStyle = '#333';
    ctx.font      = 'bold 11px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${this.toD(this.site.plotWidth).toFixed(1)} ${this.uL}`, OX + pW/2, OY + pD + 20);
    ctx.save();
    ctx.translate(OX - 30, OY + pD/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText(`${this.toD(this.site.plotDepth).toFixed(1)} ${this.uL}`, 0, 0);
    ctx.restore();

    // ── Setback labels
    ctx.font      = '9px monospace'; ctx.fillStyle = '#888';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`N ${this.toD(sb.north).toFixed(1)}${this.uL}`, OX + pW/2, OY + sb.north*S/2);
    ctx.fillText(`S ${this.toD(sb.south).toFixed(1)}${this.uL}`, OX + pW/2, OY + (this.site.plotDepth - sb.south/2)*S);
    ctx.save(); ctx.translate(OX + sb.west*S/2, OY + pD/2);
    ctx.rotate(-Math.PI/2); ctx.fillText(`W ${this.toD(sb.west).toFixed(1)}${this.uL}`, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(OX + (this.site.plotWidth - sb.east/2)*S, OY + pD/2);
    ctx.rotate(-Math.PI/2); ctx.fillText(`E ${this.toD(sb.east).toFixed(1)}${this.uL}`, 0, 0); ctx.restore();

    // ── Compass rose (top-right)
    const cxR = W - 38;
    const cyR = 38;
    const cr  = 22;
    ctx.strokeStyle = '#333'; ctx.fillStyle = '#333'; ctx.lineWidth = 1.2;
    // Circle
    ctx.beginPath(); ctx.arc(cxR, cyR, cr, 0, Math.PI*2); ctx.stroke();
    // N arrow (filled)
    ctx.beginPath();
    ctx.moveTo(cxR, cyR - cr + 2); ctx.lineTo(cxR - 6, cyR); ctx.lineTo(cxR + 6, cyR); ctx.closePath();
    ctx.fillStyle = '#c0392b'; ctx.fill();
    // S arrow (outline)
    ctx.beginPath();
    ctx.moveTo(cxR, cyR + cr - 2); ctx.lineTo(cxR - 5, cyR); ctx.lineTo(cxR + 5, cyR); ctx.closePath();
    ctx.fillStyle = '#aaa'; ctx.fill();
    // E W lines
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cxR - cr + 4, cyR); ctx.lineTo(cxR + cr - 4, cyR); ctx.stroke();
    // Labels
    ctx.font = 'bold 9px Arial'; ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', cxR, cyR - cr - 7);
    ctx.fillText('S', cxR, cyR + cr + 7);
    ctx.fillText('E', cxR + cr + 7, cyR);
    ctx.fillText('W', cxR - cr - 7, cyR);

    // ── Title bar
    ctx.fillStyle   = '#333';
    ctx.font        = 'bold 11px Arial';
    ctx.textAlign   = 'left';
    ctx.textBaseline= 'top';
    ctx.fillText('TOP ELEVATION  —  ROOF PLAN', OX, 4);
    ctx.font = '9px Arial'; ctx.fillStyle = '#777';
    ctx.fillText(`${this.site.floors} Floor(s)  ·  ${this.site.facing} Facing  ·  Plot ${this.toD(this.site.plotWidth).toFixed(1)} × ${this.toD(this.site.plotDepth).toFixed(1)} ${this.uL}`, OX, 17);
  }

  // ── 3D Scene ──────────────────────────────────────────────────────────────

  switchView(view: '2d' | 'elev' | '3d') {
    this.activeView = view;
    if (view === '3d') {
      setTimeout(() => this.init3D(), 50);
    } else if (view === 'elev') {
      setTimeout(() => this.renderElevSubView(), 50);
    } else {
      setTimeout(() => this.draw2D(), 50);
    }
  }

  switchElevSub(sub: 'front' | 'top') {
    this.elevSubView = sub;
    setTimeout(() => this.renderElevSubView(), 30);
  }

  private renderElevSubView() {
    if (this.elevSubView === 'front') {
      this.drawElevation();
    } else {
      this.drawTopElevation();
    }
  }

  // Keep old switchTab for backward compatibility
  switchTab(tab: '2d' | '3d') {
    this.switchView(tab);
  }

  private init3D() {
    const canvas = this.canvas3dRef?.nativeElement;
    if (!canvas) return;

    cancelAnimationFrame(this.animId);
    this.renderer?.dispose();

    const W = canvas.clientWidth  || 800;
    const H = canvas.clientHeight || 560;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure= 1.1;

    this.scene = new THREE.Scene();
    // Sky-blue background gradient via fog + color
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
    this.updateCameraPosition();

    // ── Lights ───────────────────────────────────────────────────
    // Hemisphere: sky blue above, warm earth below
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x7a5c3a, 0.6);
    this.scene.add(hemi);

    // Ambient
    const ambient = new THREE.AmbientLight(0xfff5e0, 0.4);
    this.scene.add(ambient);

    // Sun directional (warm golden)
    const sun = new THREE.DirectionalLight(0xffe8b0, 1.4);
    sun.position.set(this.site.plotWidth + 20, 40, this.site.plotDepth + 20);
    sun.castShadow = true;
    sun.shadow.camera.near   = 0.1;
    sun.shadow.camera.far    = 300;
    const sw = Math.max(this.site.plotWidth, this.site.plotDepth) * 1.5;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -sw;
    sun.shadow.camera.right = sun.shadow.camera.top   =  sw;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    this.scene.add(sun);

    // Fill light from opposite side (soft blue)
    const fill = new THREE.DirectionalLight(0xc8e4ff, 0.3);
    fill.position.set(-10, 20, -10);
    this.scene.add(fill);

    // ── Ground ───────────────────────────────────────────────────
    const groundSize = Math.max(this.site.plotWidth, this.site.plotDepth) * 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x4a7c3f })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.site.plotWidth/2, -0.01, this.site.plotDepth/2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Concrete plot area (within plot boundary)
    const plotSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(this.site.plotWidth, this.site.plotDepth),
      new THREE.MeshLambertMaterial({ color: 0xd4c8b0 })
    );
    plotSurface.rotation.x = -Math.PI / 2;
    plotSurface.position.set(this.site.plotWidth/2, 0.001, this.site.plotDepth/2);
    plotSurface.receiveShadow = true;
    this.scene.add(plotSurface);

    // ── Plot boundary marker ─────────────────────────────────────
    const plotGeo  = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(this.site.plotWidth, 0.05, this.site.plotDepth)
    );
    const plotEdge = new THREE.LineSegments(plotGeo, new THREE.LineBasicMaterial({ color: 0xf7c948, linewidth: 2 }));
    plotEdge.position.set(this.site.plotWidth/2, 0.03, this.site.plotDepth/2);
    this.scene.add(plotEdge);

    this.build3DFloors();

    // Mouse controls
    canvas.onmousedown = (e) => { this.isDragging = true; this.prevMouse = { x: e.clientX, y: e.clientY }; };
    canvas.onmouseup   = () => this.isDragging = false;
    canvas.onmousemove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.cameraTheta -= dx * 0.5;
      this.cameraPhi    = Math.max(5, Math.min(80, this.cameraPhi - dy * 0.4));
      this.prevMouse    = { x: e.clientX, y: e.clientY };
      this.updateCameraPosition();
    };
    canvas.onwheel = (e) => {
      this.cameraRadius = Math.max(8, Math.min(120, this.cameraRadius + e.deltaY * 0.05));
      this.updateCameraPosition();
      e.preventDefault();
    };

    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // ── 3D Furniture ─────────────────────────────────────────────────────────

  private addFurniture3D(room: Room, floorY: number, _fh: number, floorMeshList: THREE.Object3D[]) {
    const mat = (color: number, transparent = false, opacity = 1) =>
      new THREE.MeshLambertMaterial({ color, transparent, opacity });

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      floorMeshList.push(mesh);
      return mesh;
    };

    const addCylinder = (r: number, h: number, x: number, y: number, z: number, color: number, segs = 12) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      floorMeshList.push(mesh);
      return mesh;
    };

    // Room center in world space
    const cx = room.x + room.width / 2;
    const cz = room.y + room.depth / 2;
    const baseY = floorY + 0.2; // just above floor slab

    switch (room.type) {
      case 'Master Bedroom': {
        // Mattress
        addBox(1.6, 0.3, 2.0, cx, baseY + 0.15, cz, 0xf5f0e8);
        // Headboard
        addBox(1.65, 0.5, 0.1, cx, baseY + 0.25, cz - room.depth * 0.3, 0x5c3d1e);
        // Pillows
        addBox(0.45, 0.12, 0.35, cx - 0.5, baseY + 0.36, cz - room.depth * 0.25, 0xffffff);
        addBox(0.45, 0.12, 0.35, cx + 0.5, baseY + 0.36, cz - room.depth * 0.25, 0xffffff);
        // Bedside tables
        addBox(0.4, 0.55, 0.4, cx - 1.1, baseY + 0.275, cz - room.depth * 0.1, 0x8b6914);
        addBox(0.4, 0.55, 0.4, cx + 1.1, baseY + 0.275, cz - room.depth * 0.1, 0x8b6914);
        // Wardrobe (against north wall)
        addBox(Math.min(room.width * 0.55, 1.8), 2.1, 0.55, cx, floorY + 1.05, room.y + room.depth - 0.28, 0x5c3d1e);
        // Ceiling fan (centre of room)
        { const fY = floorY + _fh - 0.18;
          addBox(0.18, 0.16, 0.18, cx, fY, cz, 0x4a5568);
          addBox(0.55, 0.02, 0.12, cx - 0.3, fY - 0.06, cz, 0xc8b577);
          addBox(0.55, 0.02, 0.12, cx + 0.3, fY - 0.06, cz, 0xc8b577);
          addBox(0.12, 0.02, 0.55, cx, fY - 0.06, cz - 0.3, 0xc8b577);
          addBox(0.12, 0.02, 0.55, cx, fY - 0.06, cz + 0.3, 0xc8b577);
        }
        // Wall-mounted AC (north wall, upper zone)
        { const acY = floorY + _fh * 0.78;
          addBox(0.85, 0.25, 0.2, cx, acY, room.y + room.depth - 0.1, 0xe2e8f0);
          addBox(0.82, 0.04, 0.16, cx, acY - 0.14, room.y + room.depth - 0.14, 0x94a3b8);
        }
        break;
      }
      case 'Bedroom': {
        addBox(1.4, 0.25, 1.9, cx, baseY + 0.125, cz, 0xf5f0e8);
        addBox(1.45, 0.45, 0.1, cx, baseY + 0.225, cz - room.depth * 0.28, 0x5c3d1e);
        addBox(0.4, 0.1, 0.32, cx - 0.44, baseY + 0.3, cz - room.depth * 0.22, 0xffffff);
        addBox(0.4, 0.1, 0.32, cx + 0.44, baseY + 0.3, cz - room.depth * 0.22, 0xffffff);
        addBox(0.35, 0.5, 0.35, cx - 0.95, baseY + 0.25, cz - room.depth * 0.1, 0x8b6914);
        addBox(0.35, 0.5, 0.35, cx + 0.95, baseY + 0.25, cz - room.depth * 0.1, 0x8b6914);
        // Ceiling fan
        { const fY = floorY + _fh - 0.18;
          addBox(0.15, 0.14, 0.15, cx, fY, cz, 0x4a5568);
          addBox(0.48, 0.02, 0.1, cx - 0.26, fY - 0.06, cz, 0xc8b577);
          addBox(0.48, 0.02, 0.1, cx + 0.26, fY - 0.06, cz, 0xc8b577);
          addBox(0.1, 0.02, 0.48, cx, fY - 0.06, cz - 0.26, 0xc8b577);
          addBox(0.1, 0.02, 0.48, cx, fY - 0.06, cz + 0.26, 0xc8b577);
        }
        // AC unit on north wall
        { const acY = floorY + _fh * 0.76;
          addBox(0.75, 0.22, 0.18, cx, acY, room.y + room.depth - 0.09, 0xe2e8f0);
          addBox(0.72, 0.03, 0.14, cx, acY - 0.12, room.y + room.depth - 0.13, 0x94a3b8);
        }
        break;
      }
      case 'Living Room': {
        // Sofa seat
        addBox(1.8, 0.45, 0.7, cx, baseY + 0.225, cz + room.depth * 0.1, 0x6b7280);
        // Sofa backrest
        addBox(1.8, 0.5, 0.15, cx, baseY + 0.475, cz + room.depth * 0.1 + 0.42, 0x6b7280);
        // Sofa side arm
        addBox(0.15, 0.45, 0.7, cx - 1.0, baseY + 0.225, cz + room.depth * 0.1, 0x6b7280);
        addBox(0.15, 0.45, 0.7, cx + 1.0, baseY + 0.225, cz + room.depth * 0.1, 0x6b7280);
        // Coffee table
        addBox(0.8, 0.4, 0.5, cx, baseY + 0.2, cz - room.depth * 0.15, 0x8b6914);
        // TV unit against north wall
        addBox(1.2, 0.8, 0.2, cx, baseY + 0.4, cz + room.depth * 0.35, 0x1a1f2e);
        // TV screen (flat panel)
        addBox(1.05, 0.6, 0.04, cx, baseY + 0.7, cz + room.depth * 0.35 + 0.12, 0x0a0a0f);
        // Ceiling fan (centre of room)
        { const fY = floorY + _fh - 0.18;
          addBox(0.2, 0.18, 0.2, cx, fY, cz, 0x4a5568);
          addBox(0.62, 0.02, 0.13, cx - 0.36, fY - 0.07, cz, 0xc8b577);
          addBox(0.62, 0.02, 0.13, cx + 0.36, fY - 0.07, cz, 0xc8b577);
          addBox(0.13, 0.02, 0.62, cx, fY - 0.07, cz - 0.36, 0xc8b577);
          addBox(0.13, 0.02, 0.62, cx, fY - 0.07, cz + 0.36, 0xc8b577);
        }
        break;
      }
      case 'Dining Room': {
        // Table
        addBox(1.2, 0.75, 0.7, cx, baseY + 0.375, cz, 0x8b6914);
        // 4 Chairs
        const chairPositions = [
          [cx, cz - 0.6], [cx, cz + 0.6],
          [cx - 0.75, cz], [cx + 0.75, cz]
        ];
        chairPositions.forEach(([chx, chz]) => {
          addCylinder(0.2, 0.75, chx, baseY + 0.375, chz, 0x6b7280, 8);
        });
        break;
      }
      case 'Kitchen': {
        // Counter along south wall
        addBox(room.width - 0.1, 0.85, 0.5, cx, baseY + 0.425, room.y + 0.25, 0xf5f0e8);
        // Sink cylinder on counter
        addCylinder(0.2, 0.05, cx - room.width * 0.2, baseY + 0.875, room.y + 0.25, 0xb0bec5, 12);
        // Stove
        addBox(0.6, 0.05, 0.5, cx + room.width * 0.2, baseY + 0.875, room.y + 0.25, 0x2d3748);
        // 4 burners
        const burnerOff = 0.12;
        [[cx + room.width * 0.2 - burnerOff, room.y + 0.25 - burnerOff],
         [cx + room.width * 0.2 + burnerOff, room.y + 0.25 - burnerOff],
         [cx + room.width * 0.2 - burnerOff, room.y + 0.25 + burnerOff],
         [cx + room.width * 0.2 + burnerOff, room.y + 0.25 + burnerOff]].forEach(([bx2, bz2]) => {
          addCylinder(0.07, 0.04, bx2, baseY + 0.905, bz2, 0x555555, 8);
        });
        break;
      }
      case 'Bathroom': {
        // Bathtub against west wall
        addBox(0.7, 0.4, 1.5, room.x + 0.35, baseY + 0.2, cz, 0xffffff);
        // Toilet
        addBox(0.4, 0.4, 0.5, cx + room.width * 0.2, baseY + 0.2, room.y + 0.25, 0xffffff);
        break;
      }
      case 'Toilet': {
        addBox(0.4, 0.4, 0.5, cx, baseY + 0.2, cz, 0xffffff);
        break;
      }
      case 'Pooja Room': {
        // Altar
        addBox(0.5, 0.6, 0.3, cx, baseY + 0.3, cz - room.depth * 0.2, 0xff8c00);
        break;
      }
      case 'Garage': {
        // Stylized car box
        addBox(1.7, 0.5, 3.8, cx, baseY + 0.25, cz, 0x4a90e2);
        break;
      }
      case 'Study Room': {
        // Desk
        addBox(1.0, 0.75, 0.5, room.x + 0.5, baseY + 0.375, room.y + 0.25, 0x8b6914);
        // Chair
        addCylinder(0.2, 0.5, room.x + 0.5, baseY + 0.25, room.y + 0.8, 0x6b7280, 8);
        // Monitor
        addBox(0.5, 0.35, 0.05, room.x + 0.5, baseY + 0.93, room.y + 0.18, 0x1a1f2e);
        break;
      }

      case 'Staircase': {
        // ── Properly modelled staircase ─────────────────────────────────────
        // N-S (default): steps run from room.y → room.y+depth, tread width = room.width
        // E-W (rotated): steps run from room.x → room.x+width, tread width = room.depth
        const isRotated3D = !!room.rotated;
        const STEP_COUNT  = Math.max(6, Math.round(_fh / 0.175));  // ~175 mm per step
        const stepRise    = _fh / STEP_COUNT;
        const stepRun     = isRotated3D ? room.width  / STEP_COUNT : room.depth / STEP_COUNT;
        const stepW       = isRotated3D ? room.depth  * 0.86       : room.width * 0.86;
        const TREAD_T     = 0.038;                                   // tread slab thickness

        const treadMat    = new THREE.MeshLambertMaterial({ color: 0xc8bfab });
        const riserMat    = new THREE.MeshLambertMaterial({ color: 0xa09888 });
        const nosingMat   = new THREE.MeshLambertMaterial({ color: 0xf0ece4 });
        const stringerMat = new THREE.MeshLambertMaterial({ color: 0xd4ccc0 });
        const postMat     = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
        const railMat     = new THREE.MeshLambertMaterial({ color: 0xf7c948 });

        // ── Treads, risers, nosings ───────────────────────────────────────
        for (let s = 0; s < STEP_COUNT; s++) {
          const treadTopY = floorY + (s + 1) * stepRise;

          if (!isRotated3D) {
            // N-S: vary Z, stepW along X
            const treadZ = room.y + s * stepRun + stepRun / 2;
            const tread = new THREE.Mesh(new THREE.BoxGeometry(stepW, TREAD_T, stepRun + 0.015), treadMat);
            tread.position.set(cx, treadTopY - TREAD_T / 2, treadZ);
            tread.castShadow = true; tread.receiveShadow = true;
            this.scene.add(tread); floorMeshList.push(tread);

            const riser = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepRise, 0.022), riserMat);
            riser.position.set(cx, floorY + s * stepRise + stepRise / 2, room.y + s * stepRun);
            this.scene.add(riser); floorMeshList.push(riser);

            const nose = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.022, 0.042), nosingMat);
            nose.position.set(cx, treadTopY, room.y + s * stepRun - 0.008);
            this.scene.add(nose); floorMeshList.push(nose);
          } else {
            // E-W: vary X, stepW along Z
            const treadX = room.x + s * stepRun + stepRun / 2;
            const tread = new THREE.Mesh(new THREE.BoxGeometry(stepRun + 0.015, TREAD_T, stepW), treadMat);
            tread.position.set(treadX, treadTopY - TREAD_T / 2, cz);
            tread.castShadow = true; tread.receiveShadow = true;
            this.scene.add(tread); floorMeshList.push(tread);

            const riser = new THREE.Mesh(new THREE.BoxGeometry(0.022, stepRise, stepW), riserMat);
            riser.position.set(room.x + s * stepRun, floorY + s * stepRise + stepRise / 2, cz);
            this.scene.add(riser); floorMeshList.push(riser);

            const nose = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.022, stepW), nosingMat);
            nose.position.set(room.x + s * stepRun - 0.008, treadTopY, cz);
            this.scene.add(nose); floorMeshList.push(nose);
          }
        }

        // ── Sloped stringers ──────────────────────────────────────────────
        const slantLen   = isRotated3D
          ? Math.sqrt(room.width * room.width + _fh * _fh)
          : Math.sqrt(room.depth * room.depth + _fh * _fh);
        const slantAngle = isRotated3D
          ? Math.atan2(_fh, room.width)
          : Math.atan2(_fh, room.depth);
        const strH       = 0.22;

        [-1, 1].forEach(side => {
          const stringer = new THREE.Mesh(
            isRotated3D ? new THREE.BoxGeometry(slantLen, strH, 0.06)
                        : new THREE.BoxGeometry(0.06, strH, slantLen),
            stringerMat
          );
          if (!isRotated3D) {
            stringer.position.set(cx + side * (stepW / 2 + 0.04), floorY + _fh / 2, room.y + room.depth / 2);
            stringer.rotation.x = -slantAngle;
          } else {
            stringer.position.set(room.x + room.width / 2, floorY + _fh / 2, cz + side * (stepW / 2 + 0.04));
            stringer.rotation.z = slantAngle;
          }
          this.scene.add(stringer); floorMeshList.push(stringer);
        });

        // ── Handrail posts ────────────────────────────────────────────────
        const postHeight = 0.9;
        const railOff    = stepW / 2 - 0.06;

        for (let s = 1; s < STEP_COUNT; s += 2) {
          const postBaseY = floorY + s * stepRise;
          [-1, 1].forEach(side => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, postHeight, 6), postMat);
            if (!isRotated3D) {
              post.position.set(cx + side * railOff, postBaseY + postHeight / 2, room.y + (s - 0.5) * stepRun);
            } else {
              post.position.set(room.x + (s - 0.5) * stepRun, postBaseY + postHeight / 2, cz + side * railOff);
            }
            this.scene.add(post); floorMeshList.push(post);
          });
        }

        // ── Continuous handrail ───────────────────────────────────────────
        [-1, 1].forEach(side => {
          const rail = new THREE.Mesh(
            isRotated3D ? new THREE.BoxGeometry(slantLen, 0.05, 0.05)
                        : new THREE.BoxGeometry(0.05, 0.05, slantLen),
            railMat
          );
          if (!isRotated3D) {
            rail.position.set(cx + side * railOff, floorY + _fh / 2 + postHeight, room.y + room.depth / 2);
            rail.rotation.x = -slantAngle;
          } else {
            rail.position.set(room.x + room.width / 2, floorY + _fh / 2 + postHeight, cz + side * railOff);
            rail.rotation.z = slantAngle;
          }
          this.scene.add(rail); floorMeshList.push(rail);
        });

        // ── Newel posts ───────────────────────────────────────────────────
        const newelH = postHeight + 0.18;
        const newelEnds = isRotated3D
          ? [{ baseY: floorY, xPos: room.x }, { baseY: floorY + _fh, xPos: room.x + room.width }]
          : [{ baseY: floorY, zPos: room.y }, { baseY: floorY + _fh, zPos: room.y + room.depth }];

        newelEnds.forEach((end: any) => {
          [-1, 1].forEach(side => {
            const newel = new THREE.Mesh(new THREE.BoxGeometry(0.09, newelH, 0.09), postMat);
            if (!isRotated3D) {
              newel.position.set(cx + side * railOff, end.baseY + newelH / 2, end.zPos);
            } else {
              newel.position.set(end.xPos, end.baseY + newelH / 2, cz + side * railOff);
            }
            this.scene.add(newel); floorMeshList.push(newel);
          });
        });

        break;
      }

      case 'Balcony': {
        // ── Balcony: glass railing + outdoor lounge chairs + table ─────────
        const railH = 1.05; // standard balcony railing height
        const postM = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
        const glassRailM = new THREE.MeshLambertMaterial({ color: 0x88ccee, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
        const numPosts = Math.max(2, Math.floor(room.width / 0.6));
        // Vertical posts along south edge
        for (let n = 0; n <= numPosts; n++) {
          const px = room.x + (room.width / numPosts) * n;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, railH, 6), postM);
          post.position.set(px, floorY + railH / 2, room.y + 0.09);
          this.scene.add(post); floorMeshList.push(post);
        }
        // Glass railing panel
        const gPanel = new THREE.Mesh(new THREE.BoxGeometry(room.width, railH * 0.82, 0.018), glassRailM);
        gPanel.position.set(cx, floorY + railH * 0.52, room.y + 0.09);
        this.scene.add(gPanel); floorMeshList.push(gPanel);
        // Top handrail
        const topRailMesh = new THREE.Mesh(new THREE.BoxGeometry(room.width + 0.06, 0.05, 0.09), postM);
        topRailMesh.position.set(cx, floorY + railH + 0.025, room.y + 0.09);
        this.scene.add(topRailMesh); floorMeshList.push(topRailMesh);
        // Outdoor lounge chairs (if wide enough)
        if (room.width >= 1.8) {
          const nChairs = Math.min(2, Math.floor(room.width / 0.75));
          for (let n = 0; n < nChairs; n++) {
            const chX = cx + (n === 0 ? -0.45 : 0.45) * (room.width < 2 ? 0.6 : 1);
            addBox(0.52, 0.35, 0.48, chX, baseY + 0.175, cz - 0.08, 0x5c4a3a);    // seat
            addBox(0.52, 0.42, 0.08, chX, baseY + 0.42,  cz - 0.28, 0x5c4a3a);   // backrest
            addBox(0.48, 0.05, 0.44, chX, baseY + 0.37,  cz - 0.08, 0x4a90e2);   // cushion
          }
          // Small side table between chairs
          addCylinder(0.16, 0.52, cx, baseY + 0.26, cz - 0.08, 0x9ca3af, 10);
          const tabletopMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0xc8bfb0 }));
          tabletopMesh.position.set(cx, floorY + 0.52 + 0.2 + 0.015, cz - 0.08);
          this.scene.add(tabletopMesh); floorMeshList.push(tabletopMesh);
        }
        // Potted plants at corners
        addCylinder(0.14, 0.3, room.x + 0.2, baseY + 0.15, cz + room.depth * 0.25, 0x6b4f30, 8);
        const plant1 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2d7a3a }));
        plant1.position.set(room.x + 0.2, floorY + 0.3 + 0.2 + 0.2, cz + room.depth * 0.25);
        this.scene.add(plant1); floorMeshList.push(plant1);
        break;
      }

      case 'Store Room': {
        // ── Store Room: floor-to-ceiling shelving units ─────────────────────
        const shelfBoardM = new THREE.MeshLambertMaterial({ color: 0xc8b577 });
        const boxHeights  = [0.2, 0.15, 0.18, 0.13, 0.22, 0.16]; // deterministic box heights
        const shelfCount  = 4;
        const shelfGap    = (_fh - 0.25) / shelfCount;
        const shelfD      = 0.35;
        // Vertical support posts
        addBox(0.06, _fh - 0.1, 0.06, room.x + 0.12,              floorY + (_fh - 0.1) / 2, room.y + shelfD + 0.04, 0x8b6914);
        addBox(0.06, _fh - 0.1, 0.06, room.x + room.width - 0.12, floorY + (_fh - 0.1) / 2, room.y + shelfD + 0.04, 0x8b6914);
        for (let s = 0; s < shelfCount; s++) {
          const shY = floorY + 0.25 + s * shelfGap;
          // Shelf board
          const board = new THREE.Mesh(new THREE.BoxGeometry(room.width - 0.24, 0.04, shelfD), shelfBoardM);
          board.position.set(cx, shY, room.y + shelfD / 2 + 0.06);
          this.scene.add(board); floorMeshList.push(board);
          // Storage items on shelf
          const itemCnt = Math.max(2, Math.floor((room.width - 0.3) / 0.35));
          for (let n = 0; n < itemCnt; n++) {
            const bx2 = room.x + 0.18 + n * (room.width - 0.36) / itemCnt + 0.1;
            const bh2 = boxHeights[n % boxHeights.length];
            addBox(0.2, bh2, 0.28, bx2, shY + 0.02 + bh2 / 2, room.y + 0.09 + shelfD / 2, n % 2 === 0 ? 0x4a5568 : 0x374151);
          }
        }
        break;
      }

      case 'Lobby': {
        // ── Lobby: reception desk + waiting seats + plants ──────────────────
        const deskW   = Math.min(room.width * 0.58, 2.2);
        const deskH   = 1.1;
        const deskD   = 0.58;
        const deskCX  = cx - room.width * 0.06;
        const deskCZ  = room.y + room.depth * 0.32;
        // Main counter body
        addBox(deskW, deskH, deskD, deskCX, floorY + deskH / 2, deskCZ, 0x374151);
        // Counter top panel
        addBox(deskW + 0.12, 0.06, deskD + 0.14, deskCX, floorY + deskH + 0.03, deskCZ, 0x64748b);
        // L-shape wing
        addBox(0.55, deskH, deskW * 0.42, deskCX + deskW / 2 + 0.275, floorY + deskH / 2,
               deskCZ - deskW * 0.21 + deskD / 2, 0x374151);
        addBox(0.55 + 0.12, 0.06, deskW * 0.42 + 0.12, deskCX + deskW / 2 + 0.275,
               floorY + deskH + 0.03, deskCZ - deskW * 0.21 + deskD / 2, 0x64748b);
        // Monitor on desk
        addBox(0.45, 0.32, 0.04, deskCX - 0.2, floorY + deskH + 0.22, deskCZ - deskD / 2 + 0.04, 0x0f1117);
        // Waiting chairs along back wall
        const chairCnt = Math.min(4, Math.max(1, Math.floor(room.width / 0.65)));
        for (let n = 0; n < chairCnt; n++) {
          const chX = room.x + 0.35 + n * (room.width - 0.5) / chairCnt;
          addBox(0.48, 0.42, 0.48, chX, baseY + 0.21, room.y + room.depth * 0.74, 0x2d3748);
          addBox(0.48, 0.44, 0.08, chX, baseY + 0.42, room.y + room.depth * 0.74 + 0.22, 0x2d3748);
        }
        // Potted plants at corners
        addCylinder(0.18, 0.35, room.x + 0.28, baseY + 0.175, room.y + 0.28, 0x6b4f30, 8);
        const lPlant = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshLambertMaterial({ color: 0x2d7a3a }));
        lPlant.position.set(room.x + 0.28, floorY + 0.35 + 0.2 + 0.25, room.y + 0.28);
        this.scene.add(lPlant); floorMeshList.push(lPlant);
        break;
      }
    }
  }

  // ── 3D Site Features (trees, gate, driveway) ──────────────────────────────

  private addSiteFeatures3D() {
    const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

    const addTree = (x: number, z: number) => {
      // Trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 2.5, 8), mat(0x5c3d1e));
      trunk.position.set(x, 1.25, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      // Canopy
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 10), mat(0x2d7a3a));
      canopy.position.set(x, 3.5, z);
      canopy.castShadow = true;
      this.scene.add(canopy);
    };

    const sb = this.site.setbacks;
    const inset = 1.0; // 1m inside plot boundary
    // 4 corner trees in setback zones
    addTree(inset, inset);
    addTree(this.site.plotWidth - inset, inset);
    addTree(inset, this.site.plotDepth - inset);
    addTree(this.site.plotWidth - inset, this.site.plotDepth - inset);

    // Entrance gate (south edge, center)
    const gateX = this.site.plotWidth / 2;
    const gateZ = sb.south / 2;
    const postMat = mat(0xf5f0e8);
    // Gate posts
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), postMat);
    p1.position.set(gateX - 1.1, 1, gateZ);
    p1.castShadow = true; this.scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), postMat);
    p2.position.set(gateX + 1.1, 1, gateZ);
    p2.castShadow = true; this.scene.add(p2);
    // Gate bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.05), mat(0x8b6914));
    bar.position.set(gateX, 1.8, gateZ);
    this.scene.add(bar);

    // Driveway (from gate to building south edge)
    const drivewayLen = sb.south - 0.1;
    const driveway = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.02, drivewayLen),
      mat(0xa0a0a0)
    );
    driveway.position.set(gateX, 0.01, drivewayLen / 2);
    driveway.receiveShadow = true;
    this.scene.add(driveway);

    // Path stones along driveway
    for (let n = 0; n < 4; n++) {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.25), mat(0xc8bfb0));
      stone.position.set(gateX, 0.02, (n + 0.5) * (drivewayLen / 4));
      this.scene.add(stone);
    }

    // ── Compound boundary wall ────────────────────────────────────
    const cmpH  = 1.8;  // 1.8 m wall height (standard compound wall)
    const cmpT  = 0.18; // 180 mm wall thickness
    const cmpM  = mat(0xd4ccc0);
    const capM  = mat(0x8c7e6e);
    const pw    = this.site.plotWidth;
    const pd    = this.site.plotDepth;
    const cmpY  = cmpH / 2;

    // South wall — split into left & right segments with gate gap (2.4 m)
    const gateHalf = 1.2;
    const leftW  = gateX - gateHalf;
    const rightW = pw - gateX - gateHalf;
    if (leftW > 0) {
      const lw = new THREE.Mesh(new THREE.BoxGeometry(leftW, cmpH, cmpT), cmpM);
      lw.position.set(leftW / 2, cmpY, 0);
      lw.castShadow = true; this.scene.add(lw);
      const lwCap = new THREE.Mesh(new THREE.BoxGeometry(leftW + 0.02, 0.1, cmpT + 0.06), capM);
      lwCap.position.set(leftW / 2, cmpH + 0.05, 0); this.scene.add(lwCap);
    }
    if (rightW > 0) {
      const rw2 = new THREE.Mesh(new THREE.BoxGeometry(rightW, cmpH, cmpT), cmpM);
      rw2.position.set(gateX + gateHalf + rightW / 2, cmpY, 0);
      rw2.castShadow = true; this.scene.add(rw2);
      const rwCap = new THREE.Mesh(new THREE.BoxGeometry(rightW + 0.02, 0.1, cmpT + 0.06), capM);
      rwCap.position.set(gateX + gateHalf + rightW / 2, cmpH + 0.05, 0); this.scene.add(rwCap);
    }
    // North wall
    const nWallM2 = new THREE.Mesh(new THREE.BoxGeometry(pw, cmpH, cmpT), cmpM);
    nWallM2.position.set(pw / 2, cmpY, pd);
    nWallM2.castShadow = true; this.scene.add(nWallM2);
    const nWallCap = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.02, 0.1, cmpT + 0.06), capM);
    nWallCap.position.set(pw / 2, cmpH + 0.05, pd); this.scene.add(nWallCap);
    // West wall
    const wWallM2 = new THREE.Mesh(new THREE.BoxGeometry(cmpT, cmpH, pd), cmpM);
    wWallM2.position.set(0, cmpY, pd / 2);
    wWallM2.castShadow = true; this.scene.add(wWallM2);
    const wWallCap = new THREE.Mesh(new THREE.BoxGeometry(cmpT + 0.06, 0.1, pd + 0.02), capM);
    wWallCap.position.set(0, cmpH + 0.05, pd / 2); this.scene.add(wWallCap);
    // East wall
    const eWallM2 = new THREE.Mesh(new THREE.BoxGeometry(cmpT, cmpH, pd), cmpM);
    eWallM2.position.set(pw, cmpY, pd / 2);
    eWallM2.castShadow = true; this.scene.add(eWallM2);
    const eWallCap = new THREE.Mesh(new THREE.BoxGeometry(cmpT + 0.06, 0.1, pd + 0.02), capM);
    eWallCap.position.set(pw, cmpH + 0.05, pd / 2); this.scene.add(eWallCap);

    // Corner pillars (4 corners + gate pillars)
    const pillarPositions = [
      [0, 0], [pw, 0], [0, pd], [pw, pd],
      [gateX - gateHalf, 0], [gateX + gateHalf, 0]  // gate pillars
    ];
    pillarPositions.forEach(([px2, pz2]) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, cmpH + 0.3, 0.28), cmpM);
      pillar.position.set(px2, (cmpH + 0.3) / 2, pz2);
      pillar.castShadow = true; this.scene.add(pillar);
      const pillarCap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), capM);
      pillarCap.position.set(px2, cmpH + 0.3 + 0.06, pz2); this.scene.add(pillarCap);
    });

    // Gate panel with decorative horizontal bars
    const gatePanel = new THREE.Mesh(new THREE.BoxGeometry(gateHalf * 2, 1.6, 0.04), mat(0x8b6914));
    gatePanel.position.set(gateX, 0.8, 0.0);
    this.scene.add(gatePanel);
    for (let row = 1; row <= 4; row++) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(gateHalf * 2 + 0.06, 0.06, 0.06), mat(0xf7c948));
      hBar.position.set(gateX, row * 0.32, 0.0);
      this.scene.add(hBar);
    }
  }

  private build3DFloors() {
    this.floor3DMeshes.clear();

    const fh     = this.site.floorHeight;
    const sb     = this.site.setbacks;
    const bx     = sb.west;                               // building start X
    const bz     = sb.south;                              // building start Z
    const bw     = this.site.plotWidth  - sb.east  - sb.west;
    const bd     = this.site.plotDepth  - sb.north - sb.south;
    const WT     = 0.22;  // wall thickness metres
    const WALL_CLR  = 0xf2ede4;  // off-white exterior plaster
    const WALL_MAT  = new THREE.MeshLambertMaterial({ color: WALL_CLR });
    const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x88ccee, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const FRAME_MAT = new THREE.MeshLambertMaterial({ color: 0xd4ccc0 });
    const DOOR_MAT  = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
    const SLAB_MAT  = new THREE.MeshLambertMaterial({ color: 0xbfb8ab });
    const ROOF_MAT  = new THREE.MeshLambertMaterial({ color: 0x8c7e6e });
    const TRIM_MAT  = new THREE.MeshLambertMaterial({ color: 0xf7c948 }); // gold trims

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, cast = true, floorList?: THREE.Object3D[]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow    = cast;
      m.receiveShadow = true;
      this.scene.add(m);
      if (floorList) floorList.push(m);
      return m;
    };

    for (let f = 0; f < this.site.floors; f++) {
      const floorY   = f * fh;
      const midFloorY = floorY + fh / 2;
      const config   = this.floors[f];

      // Collect meshes for this floor for visibility toggling
      const floorMeshList: THREE.Object3D[] = [];
      this.floor3DMeshes.set(f, floorMeshList);

      // ── Floor slab ────────────────────────────────────────────
      addBox(bw + WT*2, 0.18, bd + WT*2, bx + bw/2, floorY + 0.09, bz + bd/2, SLAB_MAT, false, floorMeshList);

      // ── Room floor decals (coloured area visible from above) ──
      if (config) {
        for (const room of config.rooms) {
          const hex = parseInt(room.color.replace('#', ''), 16);
          const rm  = new THREE.Mesh(
            new THREE.PlaneGeometry(room.width - 0.05, room.depth - 0.05),
            new THREE.MeshLambertMaterial({ color: hex, transparent: true, opacity: 0.4 })
          );
          rm.rotation.x = -Math.PI / 2;
          rm.position.set(room.x + room.width/2, floorY + 0.19, room.y + room.depth/2);
          this.scene.add(rm);
          floorMeshList.push(rm);

          // 3D Furniture
          this.addFurniture3D(room, floorY, fh, floorMeshList);

          // ── Interior wall paint planes (room colour on inside faces) ──────
          const iWallMat = new THREE.MeshLambertMaterial({
            color: hex, transparent: true, opacity: 0.55, side: THREE.DoubleSide
          });
          const wallH    = fh - 0.22; // full storey minus slab
          const midWallY = floorY + 0.2 + wallH / 2;
          const iWT      = WT + 0.01;  // slightly inside the structural wall
          // South interior wall
          const swm = new THREE.Mesh(new THREE.PlaneGeometry(room.width - iWT * 2, wallH), iWallMat);
          swm.position.set(room.x + room.width / 2, midWallY, room.y + iWT / 2);
          swm.rotation.y = 0; this.scene.add(swm); floorMeshList.push(swm);
          // North interior wall
          const nwm = new THREE.Mesh(new THREE.PlaneGeometry(room.width - iWT * 2, wallH), iWallMat);
          nwm.position.set(room.x + room.width / 2, midWallY, room.y + room.depth - iWT / 2);
          nwm.rotation.y = Math.PI; this.scene.add(nwm); floorMeshList.push(nwm);
          // West interior wall
          const wwm = new THREE.Mesh(new THREE.PlaneGeometry(room.depth - iWT * 2, wallH), iWallMat);
          wwm.position.set(room.x + iWT / 2, midWallY, room.y + room.depth / 2);
          wwm.rotation.y = Math.PI / 2; this.scene.add(wwm); floorMeshList.push(wwm);
          // East interior wall
          const ewm = new THREE.Mesh(new THREE.PlaneGeometry(room.depth - iWT * 2, wallH), iWallMat);
          ewm.position.set(room.x + room.width - iWT / 2, midWallY, room.y + room.depth / 2);
          ewm.rotation.y = -Math.PI / 2; this.scene.add(ewm); floorMeshList.push(ewm);
        }
      }

      // ── Exterior walls: South, North, West, East ─────────────
      // South wall (front facade — Z = bz)
      addBox(bw + WT*2, fh, WT, bx + bw/2, midFloorY, bz - WT/2, WALL_MAT, true, floorMeshList);
      // North wall
      addBox(bw + WT*2, fh, WT, bx + bw/2, midFloorY, bz + bd + WT/2, WALL_MAT, true, floorMeshList);
      // West wall
      addBox(WT, fh, bd, bx - WT/2, midFloorY, bz + bd/2, WALL_MAT, true, floorMeshList);
      // East wall
      addBox(WT, fh, bd, bx + bw + WT/2, midFloorY, bz + bd/2, WALL_MAT, true, floorMeshList);

      // ── Windows on South (front) facade ──────────────────────
      const winRooms = config?.rooms.filter(r =>
        ['Living Room','Bedroom','Master Bedroom','Kitchen','Dining Room'].includes(r.type)
      ) ?? [];

      let winXCursor = bx + 0.6;
      for (const room of winRooms) {
        if (winXCursor + room.width > bx + bw - 0.3) break;
        const winW = Math.max(room.width * 0.5, 0.8);
        const winH = fh * 0.38;
        const winX = winXCursor + (room.width - winW) / 2;
        const winYc = floorY + fh * 0.55;
        const zFace = bz - WT - 0.01;

        // Window frame
        addBox(winW + 0.1, winH + 0.1, 0.08, winX + winW/2, winYc, zFace - 0.04, FRAME_MAT, true, floorMeshList);
        // Glass pane
        addBox(winW, winH, 0.04, winX + winW/2, winYc, zFace, GLASS_MAT, true, floorMeshList);
        // Horizontal divider
        addBox(winW, 0.04, 0.05, winX + winW/2, winYc, zFace - 0.01, FRAME_MAT, true, floorMeshList);
        // Vertical divider
        addBox(0.04, winH, 0.05, winX + winW/2, winYc, zFace - 0.01, FRAME_MAT, true, floorMeshList);

        winXCursor += room.width;
      }

      // ── Windows on North facade ───────────────────────────────
      let winXCursorN = bx + 0.6;
      for (const room of (config?.rooms ?? [])) {
        if (winXCursorN + room.width > bx + bw - 0.3) break;
        if (!['Bedroom','Master Bedroom','Study Room'].includes(room.type)) { winXCursorN += room.width; continue; }
        const winW = Math.max(room.width * 0.45, 0.7);
        const winH = fh * 0.32;
        const winX = winXCursorN + (room.width - winW) / 2;
        const winYc = floorY + fh * 0.58;
        const zFace = bz + bd + WT + 0.01;

        addBox(winW + 0.1, winH + 0.1, 0.08, winX + winW/2, winYc, zFace + 0.04, FRAME_MAT, true, floorMeshList);
        addBox(winW, winH, 0.04, winX + winW/2, winYc, zFace, GLASS_MAT, true, floorMeshList);
        addBox(winW, 0.04, 0.05, winX + winW/2, winYc, zFace + 0.01, FRAME_MAT, true, floorMeshList);
        winXCursorN += room.width;
      }

      // ── Door (ground floor, south facade) ─────────────────────
      if (f === 0) {
        const doorW = 1.1;
        const doorH = fh * 0.65;
        const doorX = bx + bw / 2;
        const doorYc = floorY + doorH / 2;
        const zFace  = bz - WT - 0.01;

        // Door frame (gold trim)
        addBox(doorW + 0.2, doorH + 0.15, 0.1, doorX, doorYc + 0.08, zFace - 0.05, TRIM_MAT, true, floorMeshList);
        // Door panel
        addBox(doorW, doorH, 0.06, doorX, doorYc, zFace, DOOR_MAT, true, floorMeshList);
        // Door knob
        addBox(0.08, 0.08, 0.08, doorX + doorW * 0.3, doorYc - doorH * 0.1, zFace - 0.04,
          new THREE.MeshLambertMaterial({ color: 0xf7c948 }), true, floorMeshList);
      }

      // ── Gold floor trim band ──────────────────────────────────
      addBox(bw + WT*2 + 0.1, 0.06, 0.05, bx + bw/2, floorY, bz - WT - 0.025, TRIM_MAT, false, floorMeshList);

      // ── Horizontal band between floors ────────────────────────
      if (f > 0) {
        addBox(bw + WT*2 + 0.06, 0.12, WT + 0.06,
          bx + bw/2, floorY + 0.06, bz - WT/2, SLAB_MAT, false, floorMeshList);
      }
    }

    // ── Roof parapet ─────────────────────────────────────────────
    // Track all roof meshes so they can be hidden when viewing a single floor
    const ROOF_KEY = 9999;
    const roofMeshList: THREE.Object3D[] = [];
    this.floor3DMeshes.set(ROOF_KEY, roofMeshList);

    const roofY = this.site.floors * fh;
    const PARAPET_H  = 0.9;
    const PARAPET_T  = 0.18;

    // Roof slab
    addBox(bw + WT*2, 0.2, bd + WT*2, bx + bw/2, roofY + 0.1, bz + bd/2, SLAB_MAT, false, roofMeshList);

    // Parapet walls
    addBox(bw + WT*2, PARAPET_H, PARAPET_T, bx + bw/2, roofY + PARAPET_H/2 + 0.2, bz - WT/2, WALL_MAT, true, roofMeshList);
    addBox(bw + WT*2, PARAPET_H, PARAPET_T, bx + bw/2, roofY + PARAPET_H/2 + 0.2, bz + bd + WT/2, WALL_MAT, true, roofMeshList);
    addBox(PARAPET_T, PARAPET_H, bd + WT*2, bx - WT/2, roofY + PARAPET_H/2 + 0.2, bz + bd/2, WALL_MAT, true, roofMeshList);
    addBox(PARAPET_T, PARAPET_H, bd + WT*2, bx + bw + WT/2, roofY + PARAPET_H/2 + 0.2, bz + bd/2, WALL_MAT, true, roofMeshList);

    // Parapet top cap (dark)
    addBox(bw + WT*2 + PARAPET_T*2, 0.08, PARAPET_T + 0.06,
      bx + bw/2, roofY + PARAPET_H + 0.24, bz - WT/2, ROOF_MAT, false, roofMeshList);
    addBox(bw + WT*2 + PARAPET_T*2, 0.08, PARAPET_T + 0.06,
      bx + bw/2, roofY + PARAPET_H + 0.24, bz + bd + WT/2, ROOF_MAT, false, roofMeshList);
    addBox(PARAPET_T + 0.06, 0.08, bd + WT*2,
      bx - WT/2, roofY + PARAPET_H + 0.24, bz + bd/2, ROOF_MAT, false, roofMeshList);
    addBox(PARAPET_T + 0.06, 0.08, bd + WT*2,
      bx + bw + WT/2, roofY + PARAPET_H + 0.24, bz + bd/2, ROOF_MAT, false, roofMeshList);

    // ── Site features (trees, gate, driveway) ─────────────────
    this.addSiteFeatures3D();

    // ── Apply floor visibility based on activeFloor3D ─────────
    this.setFloor3D(this.activeFloor3D);
  }

  private updateCameraPosition() {
    const t = THREE.MathUtils.degToRad(this.cameraTheta);
    const p = THREE.MathUtils.degToRad(this.cameraPhi);
    const cx = this.site.plotWidth/2  + this.cameraRadius * Math.cos(p) * Math.sin(t);
    const cy = this.cameraRadius * Math.sin(p);
    const cz = this.site.plotDepth/2 + this.cameraRadius * Math.cos(p) * Math.cos(t);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.site.plotWidth/2, this.site.floors * this.site.floorHeight / 2, this.site.plotDepth/2);
  }

  // ── Vastu Analysis ────────────────────────────────────────────────────────

  /**
   * Divides plot into 8 compass zones based on room center relative to plot center.
   * Y increases northward in room space.
   */
  getRoomZone(room: Room): string {
    const plotCx = this.site.plotWidth  / 2;
    const plotCy = this.site.plotDepth  / 2;
    const roomCx = room.x + room.width  / 2;
    const roomCy = room.y + room.depth  / 2;

    // dx: positive = East, dy: positive = North
    const dx = roomCx - plotCx;
    const dy = roomCy - plotCy; // room Y increases northward

    // atan2 gives angle from east axis, counterclockwise
    // We want angle from North clockwise, so: bearing = atan2(dx, dy)
    const angle = Math.atan2(dx, dy) * 180 / Math.PI;
    // Normalize to [0, 360)
    const bearing = ((angle % 360) + 360) % 360;

    // 8 zones, 45° each, centered on cardinal/intercardinal directions
    // N=0°, NE=45°, E=90°, SE=135°, S=180°, SW=225°, W=270°, NW=315°
    if (bearing <  22.5 || bearing >= 337.5) return 'N';
    if (bearing <  67.5) return 'NE';
    if (bearing < 112.5) return 'E';
    if (bearing < 157.5) return 'SE';
    if (bearing < 202.5) return 'S';
    if (bearing < 247.5) return 'SW';
    if (bearing < 292.5) return 'W';
    return 'NW';
  }

  vastuStatus(room: Room): 'good' | 'warn' | 'bad' {
    const zone  = this.getRoomZone(room);
    const ideal = this.VASTU_IDEAL[room.type] ?? [];
    if (ideal.includes(zone)) return 'good';
    // Warn if adjacent zone (one step off)
    const zones = ['N','NE','E','SE','S','SW','W','NW'];
    const zi = zones.indexOf(zone);
    const adjacents = [zones[(zi + 1) % 8], zones[(zi + 7) % 8]];
    if (adjacents.some(a => ideal.includes(a))) return 'warn';
    return 'bad';
  }

  vastuMessage(room: Room): string {
    const zone   = this.getRoomZone(room);
    const status = this.vastuStatus(room);
    const ideal  = this.VASTU_IDEAL[room.type] ?? [];
    if (status === 'good') {
      return `${room.name} in ${zone} zone — excellent placement per Vastu.`;
    }
    if (status === 'warn') {
      return `${room.name} in ${zone} zone — slightly off ideal (${ideal.join('/')}).`;
    }
    return `${room.name} in ${zone} zone — consider moving to ${ideal.join(' or ')} for Vastu compliance.`;
  }

  vastuGoodCount(): number {
    return this.currentFloor?.rooms.filter(r => this.vastuStatus(r) === 'good').length ?? 0;
  }

  vastuTotalCount(): number {
    return this.currentFloor?.rooms.length ?? 0;
  }

  // ── AI Suggestion ─────────────────────────────────────────────────────────

  async getAISuggestion() {
    this.aiLoading    = true;
    this.aiSuggestion = '';

    // Build Vastu violations summary
    const violations = this.currentFloor?.rooms
      .filter(r => this.vastuStatus(r) !== 'good')
      .map(r => `${r.name} is in ${this.getRoomZone(r)} zone (ideal: ${(this.VASTU_IDEAL[r.type] ?? []).join('/')})`)
      .join('; ') || 'none';

    const prompt =
      `I am designing a ${this.site.facing}-facing residential plot of ${this.site.plotWidth}m × ${this.site.plotDepth}m ` +
      `with ${this.site.floors} floor(s). Setbacks: North ${this.site.setbacks.north}m, South ${this.site.setbacks.south}m, ` +
      `East ${this.site.setbacks.east}m, West ${this.site.setbacks.west}m. ` +
      `Currently placed rooms: ${this.currentFloor.rooms.map(r => `${r.name} (${r.width}×${r.depth}m)`).join(', ') || 'none'}. ` +
      `Vastu violations detected: ${violations}. ` +
      `Suggest the optimal room layout for this floor considering Vastu, natural light, ventilation, and Indian residential norms. ` +
      `Also advise how to fix the Vastu violations. Give room names, ideal sizes, and placement direction. Be concise.`;

    try {
      const res = await fetch(this.ollamaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, conversationHistory: [] })
      });
      const data = await res.json();
      this.aiSuggestion = data.response || data.message || JSON.stringify(data);
    } catch {
      this.aiSuggestion = 'Could not reach AI assistant. Ensure the backend is running.';
    }
    this.aiLoading = false;
    this.cdr.detectChanges();
  }

  applyAIPreset(preset: string) {
    const presets: Record<string, { type: RoomType; width: number; depth: number }[]> = {
      '2BHK': [
        { type: 'Living Room', width: 5.4, depth: 4.2 },
        { type: 'Dining Room', width: 3, depth: 3.6 },
        { type: 'Master Bedroom', width: 4.2, depth: 3.6 },
        { type: 'Bedroom', width: 3.6, depth: 3 },
        { type: 'Kitchen', width: 3, depth: 2.7 },
        { type: 'Bathroom', width: 1.8, depth: 2.4 },
        { type: 'Toilet', width: 1.2, depth: 2.1 },
        { type: 'Balcony', width: 3, depth: 1.5 }
      ],
      '3BHK': [
        { type: 'Living Room', width: 6, depth: 4.8 },
        { type: 'Dining Room', width: 3.6, depth: 3.6 },
        { type: 'Master Bedroom', width: 4.8, depth: 4.2 },
        { type: 'Bedroom', width: 4.2, depth: 3.6 },
        { type: 'Bedroom', width: 3.6, depth: 3.6 },
        { type: 'Kitchen', width: 3.6, depth: 3 },
        { type: 'Bathroom', width: 1.8, depth: 2.4 },
        { type: 'Toilet', width: 1.5, depth: 2.1 },
        { type: 'Balcony', width: 3.6, depth: 1.5 }
      ],
      'Studio': [
        { type: 'Living Room', width: 4.8, depth: 4.2 },
        { type: 'Kitchen', width: 2.4, depth: 2.4 },
        { type: 'Bathroom', width: 2, depth: 2 }
      ]
    };

    const config = presets[preset];
    if (!config) return;
    this.currentFloor.rooms   = [];
    this.currentFloor.windows = [];
    this.currentFloor.doors   = [];
    this.roomCounter = 1;

    let curX = this.site.setbacks.west;
    let curY = this.site.setbacks.south;
    let rowH = 0;

    config.forEach((r) => {
      const bW = this.site.plotWidth  - this.site.setbacks.east  - this.site.setbacks.west;
      if (curX + r.width > this.site.setbacks.west + bW) {
        curX  = this.site.setbacks.west;
        curY += rowH;
        rowH  = 0;
      }
      this.currentFloor.rooms.push({
        id:    this.roomCounter++,
        name:  r.type, type: r.type,
        width: r.width, depth: r.depth,
        x: curX, y: curY,
        color: this.ROOM_COLORS[r.type]
      });
      curX += r.width;
      rowH  = Math.max(rowH, r.depth);
    });

    this.draw2D();
    if (this.activeView === '3d') this.init3D();
  }

  exportPNG() {
    const canvas = this.canvas2dRef?.nativeElement;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = `FloorPlan_Floor${this.activeFloor + 1}.png`;
    a.click();
  }

  reset3DCamera() {
    this.cameraTheta  = 45;
    this.cameraPhi    = 55;
    this.cameraRadius = 40;
    this.updateCameraPosition();
  }

  // ── Floor 3D Visibility ───────────────────────────────────────────────────

  setFloor3D(f: number | 'all') {
    this.activeFloor3D = f;
    const ROOF_KEY = 9999;
    this.floor3DMeshes.forEach((meshes, floorIndex) => {
      // Roof (key 9999) is only visible when showing all floors
      const visible = floorIndex === ROOF_KEY
        ? (f === 'all')
        : (f === 'all') || (f === floorIndex);
      meshes.forEach(m => m.visible = visible);
    });
  }

  // ── Camera Tour ───────────────────────────────────────────────────────────

  startTour() {
    this.tourActive  = true;
    this.tourPaused  = false;
    this.tourT       = 0;
    this.animateTour();
  }

  pauseTour() {
    this.tourPaused = !this.tourPaused;
    if (!this.tourPaused) this.animateTour();
  }

  stopTour() {
    cancelAnimationFrame(this.tourAnimId);
    this.tourActive = false;
    this.tourPaused = false;
    this.tourT      = 0;
    this.reset3DCamera();
  }

  private animateTour() {
    if (!this.tourActive) return;
    const step = () => {
      if (!this.tourActive) return;
      if (!this.tourPaused) {
        this.tourT += this.tourSpeed;
        if (this.tourT >= 1) {
          this.tourT = 1;
          this.applyTourCamera(this.tourT);
          this.tourActive = false;
          return;
        }
      }
      this.applyTourCamera(this.tourT);
      this.tourAnimId = requestAnimationFrame(step);
    };
    this.tourAnimId = requestAnimationFrame(step);
  }

  private applyTourCamera(t: number) {
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    if (t < 0.25) {
      const k = t / 0.25;
      this.cameraTheta  = lerp(45, -45, k);
      this.cameraPhi    = 35;
      this.cameraRadius = 50;
    } else if (t < 0.5) {
      const k = (t - 0.25) / 0.25;
      this.cameraTheta  = lerp(-45, -45, k);
      this.cameraPhi    = lerp(35, 65, k);
      this.cameraRadius = lerp(50, 30, k);
    } else if (t < 0.75) {
      const k = (t - 0.5) / 0.25;
      this.cameraTheta  = lerp(-45, 225, k);
      this.cameraPhi    = 50;
      this.cameraRadius = 30;
    } else {
      const k = (t - 0.75) / 0.25;
      this.cameraTheta  = lerp(225, 225, k);
      this.cameraPhi    = lerp(50, 78, k);
      this.cameraRadius = lerp(30, 60, k);
    }

    this.updateCameraPosition();
  }
}
