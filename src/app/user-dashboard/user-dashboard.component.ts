import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { API_URLS } from '../core/constants';

interface RoomConfig {
  kitchen: number;
  bedroom: number;
  masterBedroom: number;
  bathroom: number;
  livingRoom: number;
  diningRoom: number;
  hasParking: boolean;
  hasBalcony: boolean;
}

interface FloorPlan {
  floorNumber: number;
  roomConfig: RoomConfig;
  imageUrl?: string;
}

interface Location {
  country: number;
  state: number;
  district: number;
}

interface Plan {
  id: number;
  title: string;
  description: string;
  length: number;
  breadth: number;
  facing: string;
  floors: number;
  location: Location;
  elevationImageUrl: string;
  floorPlans: FloorPlan[];
  createdAt: Date;
  planType: string;
  requirements: string;
  conversationId: number;
  estimatedCost?: number;
  quality: 'M' | 'S' | 'L'; // Material quality: Medium, Standard, Luxury
}

interface Message {
  id: number;
  conversationId: number;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface LocationApiModel {
  countryId: number;
  countryName: string;
  stateId: number;
  stateName: string;
  districtId: number;
  districtName: string;
}


// Add these new interfaces after your existing ones
interface Material {
  materialId: number;
  materialName: string;
  materialDescription: string;
  productGroupId: number;
  productGroup: string;
}

interface ProductGroup {
  id: number;
  name: string;
}

interface RoomDimension {
  Room: string;
  Length: number;
  Breadth: number;
  Floor: number;
}

interface MaterialQuantity {
  materialId: number;
  quantity: number;
  unit: string;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit {
  userName = 'John Doe';
  userInitials = 'JD';

  // Form inputs
  planType = 'residential';
  length = 30;
  breadth = 50;
  facing = 'North';
  floors = 1;
  requirements = '';

  // Location inputs
  selectedCountryId: number | null = null;
  selectedStateId: number | null = null;
  selectedDistrictId: number | null = null;

  // Location options (API-driven)
  locationData: LocationApiModel[] = [];
  countries: { id: number; name: string }[] = [];
  states: { id: number; name: string }[] = [];
  districts: { id: number; name: string }[] = [];


  // Add these new properties after your existing ones
materials: Material[] = [];
productGroups: ProductGroup[] = [];
selectedMaterials: number[] = [];
selectedProductGroups: number[] = [];
roomDimensions: RoomDimension[] = [];
showDimensionsConfirmation = false;
materialQuantities: MaterialQuantity[] = [];
estimatedCost = 0;
showCostBreakdown = false;

  // Floor configurations
  floorConfigs: RoomConfig[] = [];
  showRoomConfigPopup = false;
  tempFloorConfigs: RoomConfig[] = [];

  currentRoomDimFloor: number = 0;


  // Generation state
  generating = false;
  currentPlan: Plan | null = null;
  showCostEstimate = false;
  planError: string | null = null; // <-- Add error state for UI

  // History
  recentPlans: Plan[] = [];
  showConversation = false;
  conversationHistory: Message[] = [];
  messageInput = '';
  currentConversationId = 0;

  aiMaterials: any[] = [];
  aiRoomDimensions: any[] = [];
  selectedQuality: 'M' | 'S' | 'L' = 'M'; // Default to Medium

  // Add this property to track selected material for each group
  selectedMaterialsByGroup: { [groupId: number]: number | null } = {};

  // Store fetched materials per groupId
materialsByGroup: { [groupId: number]: any[] } = {};

  // Track loading state per group
  materialsLoading: { [groupId: number]: boolean } = {};

  // Helper to get AI room dimensions for a specific floor (fixes template filter error)
  getRoomDimensionsForFloor(floorIndex: number) {
    if (!Array.isArray(this.aiRoomDimensions)) return [];
    return this.aiRoomDimensions.filter(d => d.Floor === floorIndex + 1);
  }

  // Helper to get AI plan image for a specific floor (if AI returns images per floor)
  getAIPlanImageForFloor(floorNumber: number): string | null {
    if (!Array.isArray(this.aiRoomDimensions)) return null;
    const dim = this.aiRoomDimensions.find(d => d.Floor === floorNumber && d.PlanImageUrl);
    return dim ? dim.PlanImageUrl : null;
  }

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadUserData();
    this.loadRecentPlans();
    this.initializeFloorConfigs();
    this.fetchCountries();
    this.loadMaterials();
    this.aiRoomDimensions = [];
    this.aiMaterials = [];
  }


  // Load materials from API
loadMaterials() {
  this.http.get<Material[]>(API_URLS.GETALLMATERIALS)
    .subscribe({
      next: (data) => {
        this.materials = data;
        this.extractProductGroups();
      },
      error: (error) => {
        console.error('Failed to load materials:', error);
        alert('Failed to load materials. Please check your connection and API availability.');
      }
    });
}

// Extract unique product groups from materials
extractProductGroups() {
  const uniqueGroups = new Map<number, string>();
  this.materials.forEach(material => {
    uniqueGroups.set(material.productGroupId, material.productGroup);
  });
  
  this.productGroups = Array.from(uniqueGroups.entries()).map(([id, name]) => ({
    id,
    name
  }));
}

// Handle product group selection
onProductGroupChange(groupId: number, isSelected: boolean) {
  if (isSelected) {
    if (!this.selectedProductGroups.includes(groupId)) {
      this.selectedProductGroups.push(groupId);
    }
  } else {
    this.selectedProductGroups = this.selectedProductGroups.filter(id => id !== groupId);
  }
}


 goToPrevRoomDimFloor(): void {
    if (this.currentRoomDimFloor > 0) {
      this.currentRoomDimFloor--;
    }
  }

  goToNextRoomDimFloor(): void {
    if (this.currentRoomDimFloor < this.floors - 1) {
      this.currentRoomDimFloor++;
    }
  }


// Handle material selection
onMaterialChange(materialId: number, isSelected: boolean) {
  if (isSelected) {
    if (!this.selectedMaterials.includes(materialId)) {
      this.selectedMaterials.push(materialId);
    }
  } else {
    this.selectedMaterials = this.selectedMaterials.filter(id => id !== materialId);
  }
}

// Filter materials based on selected product groups
getFilteredMaterials(): Material[] {
  if (this.selectedProductGroups.length === 0) {
    return this.materials;
  }
  return this.materials.filter(material => 
    this.selectedProductGroups.includes(material.productGroupId)
  );
}

// Generate room dimensions based on floor configurations
generateRoomDimensions(): Promise<RoomDimension[]> {
  return new Promise((resolve) => {
    const dimensions: RoomDimension[] = [];
    
    this.floorConfigs.forEach((config, floorIndex) => {
      const floorNumber = floorIndex + 1;
      
      // Generate dimensions for each room type
      if (config.kitchen > 0) {
        for (let i = 0; i < config.kitchen; i++) {
          dimensions.push({
            Room: `Kitchen ${i + 1}`,
            Length: 12,
            Breadth: 10,
            Floor: floorNumber
          });
        }
      }
      
      if (config.bedroom > 0) {
        for (let i = 0; i < config.bedroom; i++) {
          dimensions.push({
            Room: `Bedroom ${i + 1}`,
            Length: 14,
            Breadth: 12,
            Floor: floorNumber
          });
        }
      }
      
      if (config.masterBedroom > 0) {
        for (let i = 0; i < config.masterBedroom; i++) {
          dimensions.push({
            Room: `Master Bedroom ${i + 1}`,
            Length: 16,
            Breadth: 14,
            Floor: floorNumber
          });
        }
      }
      
      if (config.bathroom > 0) {
        for (let i = 0; i < config.bathroom; i++) {
          dimensions.push({
            Room: `Bathroom ${i + 1}`,
            Length: 8,
            Breadth: 6,
            Floor: floorNumber
          });
        }
      }
      
      if (config.livingRoom > 0) {
        for (let i = 0; i < config.livingRoom; i++) {
          dimensions.push({
            Room: `Living Room ${i + 1}`,
            Length: 18,
            Breadth: 16,
            Floor: floorNumber
          });
        }
      }
      
      if (config.diningRoom > 0) {
        for (let i = 0; i < config.diningRoom; i++) {
          dimensions.push({
            Room: `Dining Room ${i + 1}`,
            Length: 14,
            Breadth: 12,
            Floor: floorNumber
          });
        }
      }
    });
    
    // Simulate API delay
    setTimeout(() => resolve(dimensions), 1500);
  });
}

// Confirm dimensions and proceed with plan generation
confirmDimensions() {
  this.showDimensionsConfirmation = false;
  // Continue with your existing generatePlan logic here
}

// Edit dimensions (go back to form)
editDimensions() {
  this.showDimensionsConfirmation = false;
}

// Calculate material quantities based on room dimensions and selected materials
calculateMaterialQuantities() {
  this.materialQuantities = [];
  
  // Calculate total area for all rooms
  let totalFloorArea = 0;
  let totalWallArea = 0;
  
  this.roomDimensions.forEach(room => {
    const roomArea = room.Length * room.Breadth;
    totalFloorArea += roomArea;
    
    // Calculate wall area (assuming 10ft height)
    const wallPerimeter = 2 * (room.Length + room.Breadth);
    totalWallArea += wallPerimeter * 10;
  });

  // Calculate quantities for selected materials
  this.selectedMaterials.forEach(materialId => {
    const material = this.materials.find(m => m.materialId === materialId);
    if (material) {
      let quantity = 0;
      let unit = '';

      // Material quantity calculation based on product group
      switch (material.productGroup.toLowerCase()) {
        case 'steel':
          quantity = Math.ceil(totalFloorArea * 4); // 4 kg per sq ft approximation
          unit = 'kg';
          break;
        case 'cement':
          quantity = Math.ceil(totalFloorArea * 0.4); // 0.4 bags per sq ft
          unit = 'bags';
          break;
        case 'bricks':
          quantity = Math.ceil(totalWallArea * 40); // 40 bricks per sq ft
          unit = 'pieces';
          break;
        case 'paint':
          quantity = Math.ceil(totalWallArea * 0.1); // 0.1 liters per sq ft
          unit = 'liters';
          break;
        default:
          quantity = Math.ceil(totalFloorArea * 2);
          unit = 'units';
      }

      this.materialQuantities.push({
        materialId: materialId,
        quantity: quantity,
        unit: unit
      });
    }
  });
}

  fetchCountries() {
    this.http.get<LocationApiModel[]>(API_URLS.GETALLLOCATIONS).subscribe({
      next: (data) => {
        this.locationData = data || [];
        // Unique countries
        this.countries = Array.from(
          new Map(data.map(item => [item.countryId, { id: item.countryId, name: item.countryName }])).values()
        );
        // Reset states and districts
        this.states = [];
        this.districts = [];
        this.selectedCountryId = null;
        this.selectedStateId = null;
        this.selectedDistrictId = null;
      },
      error: () => {
        this.countries = [];
        this.planError = 'Failed to load countries.';
        alert('Failed to load countries.');
      }
    });
  }

  onCountryChange() {
    this.selectedStateId = null;
    this.selectedDistrictId = null;
    this.states = [];
    this.districts = [];
    if (this.selectedCountryId) {
      this.states = Array.from(
        new Map(
          this.locationData
            .filter(item => item.countryId === this.selectedCountryId)
            .map(item => [item.stateId, { id: item.stateId, name: item.stateName }])
        ).values()
      );
    } else {
      this.states = [];
      this.districts = [];
    }
  }

  onStateChange() {
    this.selectedDistrictId = null;
    this.districts = [];
    if (this.selectedStateId) {
      this.districts = Array.from(
        new Map(
          this.locationData
            .filter(item => item.stateId === this.selectedStateId)
            .map(item => [item.districtId, { id: item.districtId, name: item.districtName }])
        ).values()
      );
    } else {
      this.districts = [];
    }
  }

  initializeFloorConfigs() {
    // Defensive: always at least 1 floor
    const numFloors = Math.max(1, this.floors);
    this.floorConfigs = Array(numFloors).fill(null).map((_, index) => ({
      kitchen: index === 0 ? 1 : 0,
      bedroom: 1,
      masterBedroom: 1,
      bathroom: 1,
      livingRoom: index === 0 ? 1 : 0,
      diningRoom: index === 0 ? 1 : 0,
      hasParking: false,
      hasBalcony: false
    }));
  }

  onFloorsChange() {
    // Defensive: always at least 1 floor
    const numFloors = Math.max(1, this.floors);
    this.tempFloorConfigs = Array(numFloors).fill(null).map((_, index) => ({
      kitchen: index === 0 ? 1 : 0,
      bedroom: 1,
      masterBedroom: 1,
      bathroom: 1,
      livingRoom: index === 0 ? 1 : 0,
      diningRoom: index === 0 ? 1 : 0,
      hasParking: false,
      hasBalcony: false
    }));
    this.showRoomConfigPopup = true;
  }

  confirmRoomConfigs() {
    this.floorConfigs = this.tempFloorConfigs.map(cfg => ({ ...cfg }));
    this.showRoomConfigPopup = false;
  }

  cancelRoomConfigs() {
    this.showRoomConfigPopup = false;
  }

  loadUserData() {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      this.userName = user.name || user.Name || user.username || user.Username || 'User';
      const nameParts = this.userName.split(' ');
      this.userInitials = nameParts.length > 1
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
        : nameParts[0][0];
    }
  }

  loadRecentPlans() {
    const storedPlans = localStorage.getItem('plans');
    if (storedPlans) {
      this.recentPlans = JSON.parse(storedPlans).map((plan: any) => ({
        ...plan,
        createdAt: new Date(plan.createdAt)
      }));
    }
  }

  getFloorName(index: number): string {
    if (index === 0) return 'Ground Floor';
    if (index === 1) return 'First Floor';
    if (index === 2) return 'Second Floor';
    return `${index + 1}th Floor`;
  }

  async generatePlan() {
    this.planError = null;
    if (!this.selectedCountryId || !this.selectedStateId || !this.selectedDistrictId) {
      this.planError = 'Please select location (Country, State, and District).';
      return;
    }
    if (!this.requirements) {
      this.planError = 'Please describe your requirements.';
      return;
    }
    this.generating = true;
    this.currentPlan = null;
    this.showCostEstimate = false;

    try {
      // 1. Get AI-generated room dimensions
      const aiRoomDimensions = await this.getAIRoomDimensions();
      this.aiRoomDimensions = aiRoomDimensions;

      // 2. Get AI-generated MAP (visual layout) for these dimensions (2D/3D floor plans)
      let floorPlanImages: string[] = [];
      // try {
      //   floorPlanImages = await this.generateFloorPlanImages();
      // } catch (err) {
      //   // fallback: use placeholder for all floors
      //   floorPlanImages = this.floorConfigs.map((_, i) => this.generatePlaceholderImage(`floor-${i + 1}`));
      // }

      // 3. Get AI-generated elevation image
      let elevationImageUrl = '';
      try {
        elevationImageUrl = await this.generateElevationImage();
      } catch (err) {
        elevationImageUrl = this.generatePlaceholderImage('elevation');
      }

      // 4. Update the UI with all results
      const floorPlans: FloorPlan[] = this.floorConfigs.map((config, index) => ({
        floorNumber: index + 1,
        roomConfig: config,
        imageUrl: floorPlanImages[index] || '' // Attach the AI/placeholder image to each floor
      }));

      const plan: Plan = {
        id: Date.now(),
        title: `${this.planType.charAt(0).toUpperCase() + this.planType.slice(1)} Floor Plan`,
        description: `${this.floors}-floor ${this.planType} building in ${this.selectedDistrictId}, ${this.selectedStateId}`,
        length: this.length,
        breadth: this.breadth,
        facing: this.facing,
        floors: this.floors,
        location: {
          country: this.selectedCountryId ?? 0,
          state: this.selectedStateId ?? 0,
          district: this.selectedDistrictId ?? 0
        },
        elevationImageUrl: elevationImageUrl,
        floorPlans: floorPlans,
        createdAt: new Date(),
        planType: this.planType,
        requirements: this.requirements,
        conversationId: this.currentConversationId || Date.now(),
        quality: this.selectedQuality,
      };

      this.currentPlan = plan;
      this.recentPlans.unshift(plan);
      this.saveToDatabase();
      this.generating = false;
      this.showConversation = true;
      this.addAIMessage(`I've generated your ${this.floors}-floor ${this.planType} plan for ${this.selectedDistrictId}, ${this.selectedStateId}! The room dimensions and a visual map are ready. Would you like to get a construction cost estimate?`);
    } catch (error) {
      this.planError = 'Failed to generate plan. Please try again.';
      this.generating = false;
    }
  }

  // Generate elevation image using an external AI image API
  async generateElevationImage(): Promise<string> {
    try {
      const prompt = `Generate a realistic 3D elevation view for a ${this.floors}-floor ${this.planType} building, ${this.length}x${this.breadth} ft, facing ${this.facing}, with features: ${this.requirements}`;
      const response: any = await this.http.post('https://api.openai.com/v1/images/generations', {
        prompt,
        n: 1,
        size: '1024x768',
        response_format: 'url'
      }, {
        headers: {
          'Authorization': 'Bearer YOUR_OPENAI_API_KEY',
          'Content-Type': 'application/json'
        }
      }).toPromise();
      return response.data[0].url;
    } catch (err) {
      // fallback to placeholder if API fails
      return this.generatePlaceholderImage('elevation');
    }
  }

  // Generate 3D top view floor plan images for each floor using an external AI image API
  async generateFloorPlanImages(): Promise<string[]> {
    const imageUrls: string[] = [];
    for (let i = 0; i < this.floorConfigs.length; i++) {
      const config = this.floorConfigs[i];
      // Collect dimensions for this floor
      const floorRoomDims = this.aiRoomDimensions.filter(d => d.Floor === i + 1);
      // Compose a detailed prompt for a 2D architectural plan
      const prompt = `Generate a realistic, professional 2D architectural floor plan (like AutoCAD) for floor ${i + 1} of a ${this.floors}-floor ${this.planType} building, ${this.length}x${this.breadth} ft, facing ${this.facing}. The plan must be strictly based on the following room dimensions and layout: ${JSON.stringify(floorRoomDims)}. Draw clear room boundaries, label each room, and show doors, windows, and walls. Output should look like a real architectural drawing, not a 3D render or artistic sketch.`;
      try {
        const response: any = await this.http.post('https://api.openai.com/v1/images/generations', {
          prompt,
          n: 1,
          size: '1024x768',
          response_format: 'url'
        }, {
          headers: {
            'Authorization': 'Bearer YOUR_OPENAI_API_KEY',
            'Content-Type': 'application/json'
          }
        }).toPromise();
        console.log('OpenAI image API response for floor', i + 1, response); // <-- Debug log
        imageUrls.push(response.data[0].url);
      } catch (err) {
        console.error('OpenAI image API error for floor', i + 1, err); // <-- Debug log
        // Use SVG generated from AI dimensions as fallback
        imageUrls.push(this.generateSVGFloorPlan(floorRoomDims));
      }
    }
    return imageUrls;
  }

  // Generate a simple SVG floor plan from AI room dimensions for a given floor
  generateSVGFloorPlan(floorRoomDims: RoomDimension[]): string {
    if (!floorRoomDims || floorRoomDims.length === 0) return this.generatePlaceholderImage('svg');
    // Sort rooms by type for consistent layout
    const sortedRooms = [...floorRoomDims].sort((a, b) => a.Room.localeCompare(b.Room));
    // Layout: grid, max 3 per row
    const roomsPerRow = 3;
    const scale = 16; // 1ft = 16px for more detail
    const wall = 6; // wall thickness in px
    const padding = 30;
    let maxRowWidth = 0;
    let totalHeight = 0;
    let rowWidths: number[] = [];
    let rowHeights: number[] = [];
    let rows: RoomDimension[][] = [];
    for (let i = 0; i < sortedRooms.length; i += roomsPerRow) {
      const row = sortedRooms.slice(i, i + roomsPerRow);
      rows.push(row);
      const rowWidth = row.reduce((sum, r) => sum + r.Length, 0);
      rowWidths.push(rowWidth);
      if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
      const rowHeight = Math.max(...row.map(r => r.Breadth));
      rowHeights.push(rowHeight);
      totalHeight += rowHeight;
    }
    const svgWidth = maxRowWidth * scale + padding * 2 + (roomsPerRow - 1) * wall;
    const svgHeight = totalHeight * scale + padding * 2 + (rows.length - 1) * wall + 40;
    let svgRooms = '';
    let y = padding + 40;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      let x = padding;
      const row = rows[rowIdx];
      const rowHeight = rowHeights[rowIdx];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const room = row[colIdx];
        const width = room.Length * scale;
        const height = room.Breadth * scale;
        // Outer wall (thick)
        svgRooms += `<rect x='${x}' y='${y}' width='${width}' height='${height}' fill='none' stroke='#111' stroke-width='${wall}'/>`;
        // Inner wall (thin, only if not at edge)
        if (colIdx > 0) {
          svgRooms += `<line x1='${x}' y1='${y}' x2='${x}' y2='${y + height}' stroke='#444' stroke-width='2'/>`;
        }
        if (rowIdx > 0) {
          svgRooms += `<line x1='${x}' y1='${y}' x2='${x + width}' y2='${y}' stroke='#444' stroke-width='2'/>`;
        }
        // Door: arc on bottom wall (centered)
        svgRooms += `<path d='M${x + width/2 - 18},${y + height} a18,18 0 0,1 36,0' stroke='#111' stroke-width='2' fill='none'/>`;
        // Window: short line on right wall (centered)
        svgRooms += `<line x1='${x + width}' y1='${y + height/2 - 12}' x2='${x + width}' y2='${y + height/2 + 12}' stroke='#09f' stroke-width='3'/>`;
        // Room label (technical font)
        svgRooms += `<text x='${x + width/2}' y='${y + height/2 - 8}' font-size='16' font-family='monospace' text-anchor='middle' fill='#111'>${room.Room}</text>`;
        svgRooms += `<text x='${x + width/2}' y='${y + height/2 + 12}' font-size='13' font-family='monospace' text-anchor='middle' fill='#333'>${room.Length}x${room.Breadth} ft</text>`;
        x += width + wall;
      }
      y += rowHeight * scale + wall;
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' style='background:#fff'>
      <text x='${svgWidth / 2}' y='32' font-size='20' font-family='monospace' text-anchor='middle' fill='#111'>AI Floor Plan</text>
      ${svgRooms}
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  generatePlaceholderImage(type: string): string {
    // Use a valid placeholder image service (placehold.co instead of via.placeholder.com)
    const width = 400;
    const height = 300;
    const text = type === 'elevation' ? 'Elevation View' : `Floor ${type.split('-')[1]} Plan`;
    return `https://placehold.co/${width}x${height}/4299e1/ffffff?text=${encodeURIComponent(text)}`;
  }

  getConstructionCostEstimate() {
    if (!this.currentPlan) return;
    this.generating = true;
    
    // Prepare cost estimation data following the MaterialEstimateRequest structure
    const costData = {
      plot: {
        length: this.currentPlan.length,
        breadth: this.currentPlan.breadth,
        facing: this.currentPlan.facing,
        floors: this.currentPlan.floors
      },
      quality: this.selectedQuality,
      location: {
        countryId: this.currentPlan.location.country,
        stateId: this.currentPlan.location.state,
        districtId: this.currentPlan.location.district
      },
      floorConfigs: this.floorConfigs.map(config => ({
        kitchen: config.kitchen,
        bedroom: config.bedroom,
        masterBedroom: config.masterBedroom,
        bathroom: config.bathroom,
        livingRoom: config.livingRoom,
        diningRoom: config.diningRoom,
        hasParking: config.hasParking,
        hasBalcony: config.hasBalcony
      })),
      requirements: this.currentPlan.requirements
    };

    // Send to backend for cost estimation
    this.http.post<{estimatedCost: number}>(API_URLS.CALCULATEPRICE, costData)
      .subscribe({
        next: (response) => {
          if (this.currentPlan) {
            this.currentPlan.estimatedCost = response.estimatedCost;
            this.showCostEstimate = true;
            this.saveToDatabase();
            // Defensive: only use toLocaleString if estimatedCost is a valid number
            const cost = response.estimatedCost;
            const costString = (typeof cost === 'number' && !isNaN(cost)) ? cost.toLocaleString() : 'N/A';
            this.addAIMessage(`Based on your requirements and location, the estimated construction cost is ₹${costString}. This includes materials, labor, and basic finishing.`);
          }
          this.generating = false;
        },
        error: (error) => {
          console.error('Cost estimation failed:', error);
          alert('Cost estimation failed. Please try again or contact support.');
          this.generating = false;
        }
      });
}

  getAIMaterialsAndDimensions() {
    this.planError = null;
    if (!this.selectedCountryId || !this.selectedStateId || !this.selectedDistrictId) {
      this.planError = 'Please select location (Country, State, and District).';
      return;
    }
    if (!this.requirements) {
      this.planError = 'Please describe your requirements.';
      return;
    }

    // Ensure quality is set (default to 'M' if not selected)
    this.selectedQuality = this.selectedQuality || 'M';

    const payload = {
      plot: {
        length: this.length,
        breadth: this.breadth,
        facing: this.facing,
        floors: this.floors
      },
      location: {
        countryId: this.selectedCountryId,
        stateId: this.selectedStateId,
        districtId: this.selectedDistrictId
      },
      floorConfigs: this.floorConfigs,
      requirements: this.requirements,
      quality: this.selectedQuality  // Added quality to payload
    };

    this.generating = true;
    this.aiMaterials = [];
    this.aiRoomDimensions = [];

    this.http.post(API_URLS.CALCULATEPRICE, payload).subscribe({
      next: (response: any) => {
        this.aiMaterials = Array.isArray(response.materials) ? response.materials : [];
        this.aiRoomDimensions = Array.isArray(response.roomDimensions) ? response.roomDimensions : [];
        this.generating = false;
        this.calculateProjectPrice();
      },
      error: () => {
        this.generating = false;
        this.planError = 'Failed to get details from AI.';
      }
    });
  }

  calculateProjectPrice() {
    if (!this.aiMaterials || this.aiMaterials.length === 0) {
      alert('No material data available. Please generate materials first.');
      return;
    }

    const pricePayload = {
      countryId: this.selectedCountryId!,
      stateId: this.selectedStateId!,
      districtId: this.selectedDistrictId!,
      quality: this.selectedQuality,
      materials: this.aiMaterials
      // Add any other required fields for your .NET API
    };

    this.http.post('/api/dotnet/calculate-price', pricePayload).subscribe({
      next: (result: any) => {
        if (this.currentPlan) {
          this.currentPlan.estimatedCost = result.price;
          this.showCostEstimate = true;
        }
      },
      error: () => {
        alert('Failed to calculate price.');
      }
    });
  }

  addAIMessage(content: string) {
    if (this.currentConversationId === 0) {
      this.currentConversationId = Date.now();
    }

    const aiMessage: Message = {
      id: Date.now(),
      conversationId: this.currentConversationId,
      content: content,
      sender: 'ai',
      timestamp: new Date()
    };

    this.conversationHistory.push(aiMessage);
    this.saveToDatabase();
  }

  saveToDatabase() {
    localStorage.setItem('plans', JSON.stringify(this.recentPlans));
    localStorage.setItem('conversations', JSON.stringify(this.conversationHistory));
  }

  viewPlan(plan: Plan) {
    this.currentPlan = plan;
    this.planType = plan.planType;
    this.length = plan.length;
    this.breadth = plan.breadth;
    this.facing = plan.facing;
    this.floors = plan.floors;
    this.requirements = plan.requirements;
    this.selectedCountryId = plan.location.country;
    this.selectedStateId = plan.location.state;
    this.selectedDistrictId = plan.location.district;
    this.currentConversationId = plan.conversationId;
    this.floorConfigs = plan.floorPlans.map(fp => fp.roomConfig);
    this.showCostEstimate = !!plan.estimatedCost;
    this.aiMaterials = [];
    this.aiRoomDimensions = [];

    // Load conversation history
    const storedConversations = localStorage.getItem('conversations');
    if (storedConversations) {
      const allConversations = JSON.parse(storedConversations);
      this.conversationHistory = allConversations
        .filter((msg: any) => msg.conversationId === plan.conversationId)
        .map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
    }
    this.showConversation = true;

    // Defensive: ensure aiRoomDimensions/materials are reset
    this.aiRoomDimensions = [];
    this.aiMaterials = [];
  }

  toggleConversation() {
    this.showConversation = !this.showConversation;
  }

  sendMessage() {
    if (!this.messageInput.trim()) return;

    if (this.currentConversationId === 0) {
      this.currentConversationId = Date.now();
    }

    const userMessage: Message = {
      id: Date.now(),
      conversationId: this.currentConversationId,
      content: this.messageInput,
      sender: 'user',
      timestamp: new Date()
    };

    this.conversationHistory.push(userMessage);
    this.messageInput = '';

    setTimeout(() => {
      const aiResponse = `Thanks for your input! I'm here to help with any modifications to your plan or answer questions about construction details.`;
      const aiMessage: Message = {
        id: Date.now(),
        conversationId: this.currentConversationId,
        content: aiResponse,
        sender: 'ai',
        timestamp: new Date()
      };
      this.conversationHistory.push(aiMessage);
      this.saveToDatabase();
    }, 1000);
  }

  downloadPlan(plan: Plan) {
    window.open(plan.elevationImageUrl, '_blank');
  }

  sharePlan(plan: Plan) {
    const shareText = `Check out my ${plan.floors}-floor ${plan.planType} plan in ${plan.location.district}, ${plan.location.state}!`;
    if (navigator.share) {
      navigator.share({
        title: plan.title,
        text: shareText,
        url: `${window.location.origin}/plans/${plan.id}`
      });
    } else {
      navigator.clipboard.writeText(`${shareText} ${window.location.origin}/plans/${plan.id}`);
      alert('Share link copied to clipboard!');
    }
  }

  // Call OpenAI API to get AI-generated room dimensions for each floor
async getAIRoomDimensions(): Promise<any[]> {
  try {
    const prompt = `For a ${this.floors}-floor ${this.planType} building (${this.length}x${this.breadth} ft, facing ${this.facing}), with the following room configuration per floor: ${JSON.stringify(this.floorConfigs)}, and requirements: ${this.requirements}, provide a SINGLE FLAT JSON array (not per floor, not nested) of objects: { Floor: number, Room: string, Length: number, Breadth: number } representing realistic dimensions for each room. DO NOT include any explanation, only output the JSON array.`;
    const response: any = await this.http.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert architect and estimator.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.2
    }, {
      headers: {
        'Authorization': 'Bearer YOUR_OPENAI_API_KEY',
        'Content-Type': 'application/json'
      }
    }).toPromise();
    const text = response.choices[0].message.content;
    console.log('AI raw response:', text); // Debug
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch (err) {
    return [];
  }
}

  // Helper to filter materials by product group and quality
  getMaterialsByGroupAndQuality(groupName: string, quality: 'M' | 'S' | 'L') {
    return this.materials.filter(
      m => m.productGroup.toLowerCase() === groupName.toLowerCase() && m.materialDescription.includes(quality)
    );
  }

  // Fetch materials for a group and quality
  fetchMaterialsForGroup(group: {id: number, name: string}) {
    if (this.materialsByGroup[group.id] && this.materialsByGroup[group.id].length > 0) return; // Already loaded

    this.materialsLoading[group.id] = true;
    // Replace with your actual API endpoint and params
this.http.get<any[]>(
    `${API_URLS.GETPRODUCTBYGROUPANDQUALITY}?group=${encodeURIComponent(group.name)}&quality=${this.selectedQuality}`
 ).subscribe({
      next: (materials) => {
        this.materialsByGroup[group.id] = materials;
        this.materialsLoading[group.id] = false;
      },
      error: () => {
        this.materialsByGroup[group.id] = [];
        this.materialsLoading[group.id] = false;
      }
    });
  }

  // Handle dropdown change for each group
  onMaterialDropdownChange(groupId: number, materialId: number | null) {
    this.selectedMaterialsByGroup[groupId] = materialId;
    this.selectedMaterials = Object.values(this.selectedMaterialsByGroup).filter(id => id != null) as number[];
  }

  // Helper: Build request body for real map API
  buildRoomDimensionsRequestBody() {
    // Group aiRoomDimensions by floor
    const floorsMap: { [floor: number]: any[] } = {};
    (this.aiRoomDimensions || []).forEach(dim => {
      if (!floorsMap[dim.Floor]) floorsMap[dim.Floor] = [];
      floorsMap[dim.Floor].push({
        room: dim.Room,
        length: dim.Length,
        breadth: dim.Breadth
      });
    });
    const floors = Object.keys(floorsMap).map(floorNum => ({
      floorNumber: Number(floorNum),
      rooms: floorsMap[Number(floorNum)]
    }));
    return { floors };
  }

  // Call backend API to get real map image
  getRealMapFromBackend() {
    if (!this.aiRoomDimensions || this.aiRoomDimensions.length === 0) {
      alert('Please generate the plan first.');
      return;
    }
    const requestBody = this.buildRoomDimensionsRequestBody();
    this.generating = true;
    this.planError = null;
    // TODO: Replace with your actual backend API URL
    const apiUrl = 'https://your-backend-api.com/api/realmap';
    this.http.post(apiUrl, requestBody).subscribe({
      next: (response: any) => {
        // Expecting response: { imageUrl: string }
        if (response && response.imageUrl) {
          this.realMapImageUrl = response.imageUrl;
        } else {
          this.planError = 'Backend did not return a map image.';
        }
        this.generating = false;
      },
      error: (err) => {
        this.planError = 'Failed to get real map from backend.';
        this.generating = false;
      }
    });
  }

  realMapImageUrl: string | null = null;
}