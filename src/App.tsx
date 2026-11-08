import React, {useState, useEffect, useCallback, useRef} from 'react';
import {MapContainer, TileLayer, Marker, useMap, Circle} from 'react-leaflet';
import L from 'leaflet';
import {MapPin, Loader2, Navigation, Search, Plus, Minus, Globe, Map as MapIcon, RefreshCw, Building2, Zap, X, Upload, Camera, FileText, CheckCircle, HardHat, UserCircle2, Eye, Check, Trash2, Download, RotateCcw} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';

// Fix for default marker icons in Leaflet when using Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Custom blue dot icon for user location
const userLocationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-blue-500 rounded-full animate-ping opacity-40"></div>
      <div class="relative w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface ReferralSubmission {
  id: string;
  type: 'tenant' | 'user';
  selfie: string;
  idDoc: string;
  payment: string;
  timestamp: number;
}


// Custom component to handle map centering, searching, and manual zoom
function MapController({position, searchResult}: {position: [number, number] | null, searchResult: [number, number] | null}) {
  const map = useMap();
  const hasCentered = useRef(false);
  
  useEffect(() => {
    if (position && !hasCentered.current) {
      map.setView(position, 16);
      hasCentered.current = true;
    }
  }, [position, map]);

  useEffect(() => {
    if (searchResult) {
      map.flyTo(searchResult, 19);
    }
  }, [searchResult, map]);

  return position === null ? null : (
    <>
      <Marker position={position} icon={userLocationIcon} />
      <Circle 
        center={position} 
        radius={50} 
        pathOptions={{fillColor: '#3b82f6', color: '#3b82f6', fillOpacity: 0.1, weight: 1}} 
      />
    </>
  );
}

export default function App() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchResult, setSearchResult] = useState<[number, number] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'tenant' | 'activation' | 'referrals' | 'gigs' | 'seekers' | 'profile' | null>(null);
  const [activationStep, setActivationStep] = useState<'selection' | 'upload'>('selection');
  const [selectedSubType, setSelectedSubType] = useState<'tenant' | 'user' | null>(null);
  const [uploads, setUploads] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tempSelfie, setTempSelfie] = useState<string | null>(null);
  
  // App Logic States with Persistence
  const [userStatus, setUserStatus] = useState<'unverified' | 'tenant_approved' | 'user_approved'>(() => {
    return (localStorage.getItem('timegig_userStatus') as any) || 'unverified';
  });
  const [referralsList, setReferralsList] = useState<ReferralSubmission[]>(() => {
    const saved = localStorage.getItem('timegig_referrals');
    return saved ? JSON.parse(saved) : [];
  });
  const [tenantBalance, setTenantBalance] = useState<number>(() => {
    const saved = localStorage.getItem('timegig_balance');
    return saved ? parseFloat(saved) : 0.00;
  });
  const [profileSelfie, setProfileSelfie] = useState<string | null>(() => {
    return localStorage.getItem('timegig_profileSelfie');
  });
  const [seekerSearch, setSeekerSearch] = useState('');
  const [refSearch, setRefSearch] = useState('');
  const [viewingDocument, setViewingDocument] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sync state to localStorage
  useEffect(() => { localStorage.setItem('timegig_userStatus', userStatus); }, [userStatus]);
  useEffect(() => { localStorage.setItem('timegig_referrals', JSON.stringify(referralsList)); }, [referralsList]);
  useEffect(() => { localStorage.setItem('timegig_balance', tenantBalance.toString()); }, [tenantBalance]);
  useEffect(() => { 
    if (profileSelfie) localStorage.setItem('timegig_profileSelfie', profileSelfie);
    else localStorage.removeItem('timegig_profileSelfie');
  }, [profileSelfie]);

  const resetAccount = () => {
    if (confirm("Are you sure you want to reset your account? All data will be cleared.")) {
      localStorage.clear();
      setUserStatus('unverified');
      setReferralsList([]);
      setTenantBalance(0.00);
      setProfileSelfie(null);
      setActiveTab(null);
      window.location.reload();
    }
  };

  const downloadDocument = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `timegig_${name}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Effect to attach stream to video element once it's mounted
  useEffect(() => {
    if (showCamera && streamRef.current && videoRef.current && !isCameraLoading) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.onloadedmetadata = () => {
        video.play().catch(e => console.warn("Video play failed:", e));
      };
    }
  }, [showCamera, isCameraLoading]);

  const startCamera = async (isRetry = false) => {
    if (showCamera && !isRetry) return;
    
    setCameraError(null);
    setIsCameraLoading(true);
    setShowCamera(true);
    setTempSelfie(null);

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        setCameraError('SecurityError: Camera requires HTTPS. Please ensure you are on a secure connection.');
        setIsCameraLoading(false);
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('NotFoundError: Camera API not supported in this browser.');
        setIsCameraLoading(false);
        return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = { 
        video: { 
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsCameraLoading(false);
    } catch (err: any) {
      console.error('Primary camera fail:', err);
      try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamRef.current = fallbackStream;
          setIsCameraLoading(false);
      } catch (fallbackErr: any) {
          console.error('Fallback camera fail:', fallbackErr);
          let errorMsg = `${err.name}: ${err.message}`;
          if (err.name === 'NotAllowedError') errorMsg = "Permission Denied: Please enable camera access in your browser settings.";
          else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') errorMsg = "No camera found on this device.";
          else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') errorMsg = "Camera is already in use by another application.";
          setCameraError(errorMsg);
          setIsCameraLoading(false);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    setShowCamera(false);
    setIsCameraLoading(false);
  };

  const captureSelfie = () => {
    if (videoRef.current && streamRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          setTempSelfie(dataUrl);
      }
    }
  };

  const confirmSelfie = () => {
    if (tempSelfie) {
        fetch(tempSelfie)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], 'selfie.png', { type: 'image/png' });
                setUploads(prev => ({...prev, selfie: file}));
                setPreviews(prev => ({...prev, selfie: tempSelfie}));
                stopCamera();
            });
    }
  };

  const handleFileUpload = (id: string, file: File) => {
    setUploads(prev => ({...prev, [id]: file}));
    setPreviews(prev => ({...prev, [id]: URL.createObjectURL(file)}));
  };

  const handleSubmit = () => {
    if (!previews.selfie || !previews.idDoc || !previews.payment || !selectedSubType) {
        alert("Please complete all requirements first.");
        return;
    }
    setIsProcessing(true);
    const newReferral: ReferralSubmission = {
        id: Math.random().toString(36).substr(2, 9),
        type: selectedSubType,
        selfie: previews.selfie!,
        idDoc: previews.idDoc!,
        payment: previews.payment!,
        timestamp: Date.now()
    };
    setReferralsList(prev => [...prev, newReferral]);
    setProfileSelfie(previews.selfie!);
    setTimeout(() => {
        setIsProcessing(false);
        setActiveTab(null);
        setActivationStep('selection');
        setPreviews({});
        setUploads({});
        alert("Activation submitted for review. Expected turnaround: 15-25 minutes.");
    }, 5000);
  };

  const approveReferral = (id: string) => {
    const referral = referralsList.find(r => r.id === id);
    if (referral) {
        setUserStatus(referral.type === 'tenant' ? 'tenant_approved' : 'user_approved');
        setReferralsList(prev => prev.filter(r => r.id !== id));
        alert(`Application Approved as ${referral.type === 'tenant' ? 'Tenant' : 'User'}! Navigation updated.`);
    }
  };

  const rejectReferral = (id: string) => {
    setReferralsList(prev => prev.filter(r => r.id !== id));
    alert("Application Rejected.");
  };

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`);
        const data = await response.json();
        setSuggestions(data);
        setShowSuggestions(true);
      } catch (err) {
        console.error('Fetch suggestions failed:', err);
      }
    }, 300);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [searchQuery]);

  const selectSuggestion = (suggestion: any) => {
    setSearchResult([parseFloat(suggestion.lat), parseFloat(suggestion.lon)]);
    setSearchQuery(suggestion.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) return;
    stopTracking();
    const options: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    const onSuccess = (position: GeolocationPosition) => {
      setUserLocation([position.coords.latitude, position.coords.longitude]);
    };
    navigator.geolocation.getCurrentPosition(onSuccess, () => {}, options);
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, () => {}, options);
  }, [stopTracking]);

  useEffect(() => {
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const toggleMapType = () => setMapType(prev => prev === 'street' ? 'satellite' : 'street');

  return (
    <div className="h-screen w-full relative bg-black overflow-hidden font-sans flex flex-col">
      {isProcessing && (
        <div className="absolute inset-0 z-[5000] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center">
          <div className="relative w-32 h-32 mb-8">
             <div className="absolute inset-0 border-8 border-blue-500/20 rounded-full" />
             <div className="absolute inset-0 border-8 border-blue-500 border-t-transparent rounded-full animate-spin" />
             <div className="absolute inset-4 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-pulse" />
             </div>
          </div>
          <h3 className="text-white font-black text-3xl uppercase tracking-tight mb-4">Review in Progress</h3>
          <p className="text-blue-200 text-lg font-medium max-w-xs">Our automated tools are verifying your documents. This typically takes 15-25 minutes.</p>
          <div className="mt-12 flex gap-4 opacity-50">
             <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
             <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
             <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
          </div>
        </div>
      )}
      <motion.div 
        animate={{ filter: (activeTab && activeTab !== 'gigs') ? 'blur(10px) brightness(0.7)' : 'blur(0px) brightness(1)' }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 z-0"
      >
        <MapContainer
          center={[20, 0]}
          zoom={2}
          className="h-full w-full"
          scrollWheelZoom={true}
          zoomControl={false}
          attributionControl={false}
          ref={mapRef}
        >
          {mapType === 'street' ? (
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          ) : (
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          )}
          <MapController position={userLocation} searchResult={searchResult} />
        </MapContainer>
      </motion.div>

      {(!activeTab || activeTab === 'gigs') && (
        <>
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md">
            <div className="relative group">
              <form onSubmit={(e) => e.preventDefault()} className={`flex items-center bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 overflow-hidden px-4 py-2 rounded-3xl`}>
                <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Search address, street, house #..."
                  className="flex-1 py-2 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                />
              </form>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border border-slate-200 rounded-b-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button key={index} onClick={() => selectSuggestion(suggestion)} className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors border-t border-slate-100 first:border-t-0">
                      <p className="text-xs text-slate-700 font-bold line-clamp-1">{suggestion.display_name.split(',')[0]}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{suggestion.display_name.split(',').slice(1).join(',')}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-3">
            <button onClick={zoomIn} className="bg-white/95 backdrop-blur-md p-3 rounded-full shadow-xl border border-slate-200 text-slate-700 hover:bg-white transition-all active:scale-90"><Plus className="w-6 h-6" /></button>
            <button onClick={zoomOut} className="bg-white/95 backdrop-blur-md p-3 rounded-full shadow-xl border border-slate-200 text-slate-700 hover:bg-white transition-all active:scale-90"><Minus className="w-6 h-6" /></button>
            <button onClick={toggleMapType} className={`mt-4 p-3 rounded-full shadow-xl border transition-all active:scale-90 ${mapType === 'satellite' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/95 backdrop-blur-md border-slate-200 text-slate-700'}`}>
              {mapType === 'street' ? <Globe className="w-6 h-6" /> : <MapIcon className="w-6 h-6" />}
            </button>
          </div>
        </>
      )}

      <AnimatePresence mode="wait">
        {activeTab && activeTab !== 'gigs' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="absolute inset-0 z-[2000] bg-white/40 backdrop-blur-3xl overflow-hidden pointer-events-auto pb-20"
          >
            <div className="w-full h-full p-4 md:p-6 relative max-w-2xl mx-auto flex flex-col">
              <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
                {/* Tenant Dashboard Section */}
                {activeTab === 'tenant' && (
                  <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-left-4 duration-300 py-2">
                    <div className="flex flex-col">
                      <h2 className="text-base font-black text-slate-900 mb-2 border-b border-black/10 pb-1 uppercase tracking-tighter flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        Tenant Dashboard
                      </h2>
                      <div className="bg-slate-900/80 backdrop-blur-xl text-white p-4 rounded-[1.2rem] w-full mb-3 shadow-xl relative overflow-hidden border border-white/20">
                        <div className="absolute -top-6 -right-6 p-2 opacity-5"><MapIcon className="w-20 h-20" /></div>
                        <p className="text-[7px] uppercase tracking-[0.2em] text-slate-400 mb-0.5 font-black">Current Earnings</p>
                        <h3 className="text-2xl font-black tabular-nums mb-0.5 tracking-tighter">R {tenantBalance.toFixed(2)}</h3>
                        <p className="text-[7px] text-blue-400 font-bold mb-3">Ready for withdrawal</p>
                        <div className="flex justify-between pt-3 border-t border-white/10">
                          <div><p className="text-[6px] uppercase text-slate-500 font-bold mb-0.5">Referral Rev</p><p className="font-black text-base">R 0</p></div>
                          <div className="text-right"><p className="text-[6px] uppercase text-slate-500 font-bold mb-0.5">GiG Commission</p><p className="font-black text-base">R 0</p></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white/40 backdrop-blur-md border border-white/60 p-2 rounded-xl shadow-sm group hover:border-blue-500 transition-colors">
                           <div className="flex items-center gap-2 mb-0.5">
                              <div className="p-1 bg-blue-500/10 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><HardHat className="w-4 h-4" /></div>
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Active Gigs</p>
                           </div>
                           <p className="text-lg font-black text-slate-900">12</p>
                        </div>
                        <div className="bg-white/40 backdrop-blur-md border border-white/60 p-2 rounded-xl shadow-sm group hover:border-green-500 transition-colors">
                           <div className="flex items-center gap-2 mb-0.5">
                              <div className="p-1 bg-green-500/10 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Search className="w-2.5 h-2.5" /></div>
                              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Seekers</p>
                           </div>
                           <p className="text-lg font-black text-slate-900">48</p>
                        </div>
                      </div>
                      <div className="bg-blue-500/10 backdrop-blur-md border border-blue-200/30 p-4 rounded-xl w-full">
                        <p className="text-[8px] font-black text-blue-900 mb-2 uppercase tracking-wider">Your Referral Network</p>
                        <div className="flex gap-2">
                           <input readOnly value="referral.timegig.com/u/user123" className="flex-1 bg-white/40 backdrop-blur-md text-[8px] p-2 rounded-lg border border-white/60 font-mono text-slate-700 focus:outline-none shadow-inner"/>
                           <button className="bg-blue-600/80 backdrop-blur-md text-white px-3 py-1 rounded-lg text-[8px] font-black uppercase hover:bg-blue-700 transition-all shadow-lg active:scale-95 border border-white/20">Copy</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'activation' && (
                  <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 py-2">
                    <h2 className="text-base font-black text-slate-900 mb-3 border-b border-black/10 pb-1 uppercase tracking-tighter flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      {activationStep === 'selection' ? 'Select Subscription' : 'Finalize Activation'}
                    </h2>
                    {activationStep === 'selection' ? (
                      <div className="flex flex-col gap-2 w-full">
                        {[
                          {id: 'tenant', title: 'Tenant Tier', desc: 'Premium access for property managers & landlords.', price: 'R 499 / mo', icon: Building2, color: 'blue'},
                          {id: 'user', title: 'User Tier', desc: 'Standard access for tenants. Search local gigs.', price: 'R 99 / mo', icon: Zap, color: 'amber'}
                        ].map((sub) => (
                          <button key={sub.id} onClick={() => {setSelectedSubType(sub.id as any); setActivationStep('upload');}} className={`bg-white/40 backdrop-blur-md border-2 border-white/60 hover:border-${sub.color}-600/40 p-4 rounded-[1.2rem] text-left transition-all hover:shadow-lg group relative overflow-hidden`}>
                            <div className="flex justify-between items-center mb-2">
                              <div className={`p-2 bg-${sub.color}-500/10 rounded-lg group-hover:bg-${sub.color}-600 group-hover:text-white transition-all`}><sub.icon className="w-5 h-5" /></div>
                              <span className={`text-[8px] font-black text-${sub.color}-700 bg-white/60 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/40`}>{sub.price}</span>
                            </div>
                            <p className="font-black text-base text-slate-900 mb-0.5 tracking-tighter">{sub.title}</p>
                            <p className="text-[9px] text-slate-600 leading-tight font-medium">{sub.desc}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-white/40 backdrop-blur-md p-2 rounded-lg border border-white/60 flex justify-between items-center">
                           <div><p className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Tier</p><p className="text-[9px] font-black text-slate-900 uppercase">{selectedSubType} Sub</p></div>
                           <button onClick={() => setActivationStep('selection')} className="text-[8px] font-black text-blue-600 uppercase border-b border-blue-600/30">Change</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'selfie', label: 'Selfie', icon: Camera, action: () => startCamera() },
                            { id: 'idDoc', label: 'ID Doc', icon: Upload, action: () => document.getElementById('idDocInput')?.click() },
                            { id: 'payment', label: 'Payment', icon: FileText, action: () => document.getElementById('paymentInput')?.click() },
                          ].map((item) => (
                            <div key={item.id} className="relative">
                              {previews[item.id] ? (
                                <div className="relative group">
                                  <img src={previews[item.id]!} alt={item.label} className="w-full h-24 object-cover rounded-[1rem] border-2 border-blue-500 shadow-md" />
                                  <button onClick={item.action} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-[1rem] flex items-center justify-center transition-all"><RefreshCw className="w-4 h-4 text-white" /></button>
                                </div>
                              ) : (
                                <button onClick={item.action} className="w-full h-24 flex flex-col items-center justify-center gap-1.5 bg-white/40 backdrop-blur-md border border-dashed border-black/10 rounded-[1rem] hover:border-blue-600 hover:bg-white/60 transition-all">
                                  <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-600"><item.icon className="w-4 h-4" /></div>
                                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-700">{item.label}</span>
                                </button>
                              )}
                              <input id={`${item.id}Input`} type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(item.id, e.target.files[0])} />
                            </div>
                          ))}
                          <button disabled={!previews.selfie || !previews.idDoc || !previews.payment} onClick={handleSubmit} className={`flex flex-col items-center justify-center gap-1.5 h-24 border-2 rounded-[1rem] transition-all shadow-md ${previews.selfie && previews.idDoc && previews.payment ? 'bg-green-600/80 backdrop-blur-md border-green-400 text-white hover:bg-green-700' : 'bg-white/20 backdrop-blur-md border-black/5 opacity-40 grayscale cursor-not-allowed text-slate-400'}`}>
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Submit</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'seekers' && (
                  <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-bottom-4 duration-300 py-4">
                    <div className="w-full max-w-md mx-auto mb-6 shrink-0">
                      <div className="relative group">
                        <div className="flex items-center bg-white/80 backdrop-blur-md shadow-xl border border-white/60 overflow-hidden px-4 py-3 rounded-[2rem]">
                          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search Seekers by name or skill..."
                            className="flex-1 py-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400 font-bold"
                            value={seekerSearch}
                            onChange={(e) => setSeekerSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center">
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest opacity-60">Seekers Directory</p>
                    </div>
                  </div>
                )}

                {activeTab === 'referrals' && (
                  <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-bottom-4 duration-300 py-4">
                    <div className="w-full max-w-md mx-auto mb-6 shrink-0">
                      <div className="relative group">
                        <div className="flex items-center bg-white/80 backdrop-blur-md shadow-xl border border-white/60 overflow-hidden px-4 py-3 rounded-[2rem]">
                          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search referrals by ID or type..."
                            className="flex-1 py-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400 font-bold"
                            value={refSearch}
                            onChange={(e) => setRefSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 overflow-y-auto pr-1 pb-10">
                      {referralsList
                        .filter(r => 
                          r.id.toLowerCase().includes(refSearch.toLowerCase()) || 
                          r.type.toLowerCase().includes(refSearch.toLowerCase())
                        )
                        .length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 bg-white/10 backdrop-blur-md rounded-[2rem] border-2 border-dashed border-black/5 text-slate-400">
                            <FileText className="w-12 h-12 mb-4 opacity-10" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No referrals found</p>
                          </div>
                        ) : (
                          referralsList
                            .filter(r => 
                              r.id.toLowerCase().includes(refSearch.toLowerCase()) || 
                              r.type.toLowerCase().includes(refSearch.toLowerCase())
                            )
                            .map((ref) => (
                              <div key={ref.id} className="bg-white/40 backdrop-blur-md rounded-[1.5rem] p-4 border border-white/60 shadow-xl relative overflow-hidden group">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-3">
                                    <button onClick={() => setViewingDocument(ref.selfie)} className="relative group/img">
                                      <img src={ref.selfie} className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-lg group-hover/img:scale-110 transition-transform" alt="Applicant" />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 rounded-xl flex items-center justify-center transition-opacity"><Search className="w-4 h-4 text-white" /></div>
                                    </button>
                                    <div><p className="font-black text-xs text-slate-900 uppercase">{ref.type} APP</p><p className="text-[8px] text-slate-500 font-bold">{new Date(ref.timestamp).toLocaleTimeString()}</p></div>
                                  </div>
                                  <button onClick={() => {
                                    downloadDocument(ref.selfie, 'selfie');
                                    downloadDocument(ref.idDoc, 'id');
                                    downloadDocument(ref.payment, 'payment');
                                  }} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors" title="Download all docs">
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                   <button onClick={() => setViewingDocument(ref.idDoc)} className="relative group/img"><img src={ref.idDoc} className="w-full h-20 object-cover rounded-xl border border-white/40 group-hover/img:brightness-90 transition-all" alt="ID" /><div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[6px] text-white font-black">ID DOC</div></button>
                                   <button onClick={() => setViewingDocument(ref.payment)} className="relative group/img"><img src={ref.payment} className="w-full h-20 object-cover rounded-xl border border-white/40 group-hover/img:brightness-90 transition-all" alt="Payment" /><div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[6px] text-white font-black">PAYMENT</div></button>
                                </div>
                                <div className="flex gap-2">
                                   <button onClick={() => approveReferral(ref.id)} className="flex-[2] bg-green-600 text-white py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 shadow-md hover:bg-green-700 transition-colors"><Check className="w-4 h-4" /> Approve</button>
                                   <button onClick={() => rejectReferral(ref.id)} className="flex-1 bg-white/60 backdrop-blur-sm text-red-600 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /> Reject</button>
                                </div>
                              </div>
                            ))
                        )}
                    </div>
                  </div>
                )}



                 {activeTab === 'profile' && (
                   <div className="flex flex-col items-center justify-center py-10 h-full animate-in fade-in slide-in-from-bottom-4 duration-300 min-h-full">
                      <div className="w-24 h-24 bg-white/40 backdrop-blur-md rounded-[2.5rem] flex items-center justify-center mb-6 border-2 border-white shadow-xl overflow-hidden">
                         {profileSelfie ? (
                           <img src={profileSelfie} alt="Profile" className="w-full h-full object-cover" />
                         ) : (
                           <UserCircle2 className="w-16 h-16 text-slate-900" />
                         )}
                      </div>
                     <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">My Profile</h2>
                     <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-8">{userStatus.replace('_', ' ')}</p>
                     <div className="w-full max-w-xs flex flex-col gap-3">
                        <div className="bg-white/40 backdrop-blur-md p-5 rounded-3xl border border-white/60 shadow-sm text-center">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Email</p>
                           <p className="text-sm font-black text-slate-900">timegig2026@gmail.com</p>
                        </div>
                        <button onClick={resetAccount} className="mt-10 flex items-center justify-center gap-3 w-full bg-red-50/80 backdrop-blur-md text-red-600 py-5 rounded-3xl font-black uppercase text-xs hover:bg-red-100 transition-all border border-red-200 active:scale-95 shadow-lg">
                           <RotateCcw className="w-5 h-5" /> Reset Account
                        </button>
                     </div>
                  </div>
                )}
              </div>

              {/* Document Viewer Lightbox */}
              <AnimatePresence>
                {viewingDocument && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[5000] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6">
                    <button onClick={() => setViewingDocument(null)} className="absolute top-10 right-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all z-10"><X className="w-8 h-8" /></button>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-lg">
                      <img src={viewingDocument} className="w-full h-auto max-h-[70vh] object-contain rounded-3xl shadow-2xl border border-white/10" alt="Document Inspection" />
                      <div className="mt-8 text-center flex flex-col items-center gap-4">
                         <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.4em]">Document Inspection Mode</p>
                         <button onClick={() => downloadDocument(viewingDocument, 'inspection')} className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-black uppercase text-[10px] shadow-xl active:scale-95">
                            <Download className="w-4 h-4" /> Download File
                         </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Camera Overlay */}
              {showCamera && (
                <div className="absolute inset-0 z-[3000] bg-black flex flex-col items-center justify-center rounded-[2.5rem]">
                  {isCameraLoading && (
                     <div className="flex flex-col items-center gap-6">
                        <div className="relative w-16 h-16"><div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" /><div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                        <p className="text-white text-[8px] font-black uppercase tracking-[0.3em]">Opening Camera...</p>
                     </div>
                  )}
                  {cameraError ? (
                    <div className="text-white text-center p-8 max-w-sm">
                      <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30"><X className="w-10 h-10 text-red-500" /></div>
                      <h4 className="text-xl font-black mb-2 uppercase tracking-tighter">System Error</h4>
                      <p className="mb-8 text-slate-400 text-xs leading-relaxed font-medium">{cameraError}</p>
                      <div className="flex flex-col gap-4">
                         <button onClick={() => startCamera(true)} className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase text-xs shadow-2xl active:scale-95 transition-all">Retry</button>
                         <button onClick={stopCamera} className="w-full bg-slate-900 text-white/50 py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all">Back</button>
                      </div>
                    </div>
                  ) : !isCameraLoading && (
                    <>
                      {tempSelfie ? (
                         <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900">
                            <img src={tempSelfie} className="w-full aspect-[3/4] object-cover rounded-[2.5rem] border-4 border-white shadow-2xl mb-8" alt="Preview" />
                            <div className="flex gap-3 w-full max-w-sm">
                               <button onClick={() => setTempSelfie(null)} className="flex-1 bg-slate-800 text-white py-4 rounded-xl font-black uppercase text-xs active:scale-95 transition-all">Retake</button>
                               <button onClick={confirmSelfie} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-black uppercase text-xs shadow-2xl active:scale-95 transition-all">Confirm</button>
                            </div>
                         </div>
                      ) : (
                         <>
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            <div className="absolute top-8 left-0 right-0 flex justify-center"><div className="bg-black/60 backdrop-blur-xl px-6 py-2 rounded-full border border-white/20"><p className="text-white text-[8px] font-black uppercase tracking-[0.3em]">Identity Check</p></div></div>
                            <div className="absolute bottom-10 flex items-center gap-8">
                               <button onClick={stopCamera} className="w-12 h-12 bg-slate-900/80 backdrop-blur-xl text-white rounded-full flex items-center justify-center active:scale-90 border border-white/10"><X className="w-6 h-6" /></button>
                               <button onClick={captureSelfie} className="w-20 h-20 bg-white rounded-full border-[6px] border-slate-300 hover:scale-105 active:scale-95 flex items-center justify-center shadow-2xl"><div className="w-14 h-14 rounded-full border-2 border-slate-200" /></button>
                               <button onClick={() => startCamera(true)} className="w-12 h-12 bg-slate-900/80 backdrop-blur-xl text-white rounded-full flex items-center justify-center active:scale-90 border border-white/10"><RefreshCw className="w-6 h-6" /></button>
                            </div>
                         </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto z-[3000] w-full bg-white/95 backdrop-blur-md border-t border-slate-100 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-16 px-2">
          {userStatus === 'unverified' ? (
            <>
              <button onClick={() => setActiveTab(prev => prev === 'tenant' ? null : 'tenant')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'tenant' ? 'scale-110' : 'hover:scale-105'}`}><Building2 className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Tenant</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'referrals' ? null : 'referrals')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'referrals' ? 'scale-110' : 'hover:scale-105'}`}><FileText className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Referrals</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'activation' ? null : 'activation')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'activation' ? 'scale-110' : 'hover:scale-105'}`}><Zap className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Activation</span></button>
            </>
          ) : userStatus === 'tenant_approved' ? (
            <>
              <button onClick={() => setActiveTab(prev => prev === 'tenant' ? null : 'tenant')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'tenant' ? 'scale-110' : 'hover:scale-105'}`}><Building2 className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Tenant</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'referrals' ? null : 'referrals')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'referrals' ? 'scale-110' : 'hover:scale-105'}`}><FileText className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Referrals</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'gigs' ? null : 'gigs')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'gigs' ? 'scale-110' : 'hover:scale-105'}`}><HardHat className="w-8 h-8" /><span className="text-[8px] font-black uppercase tracking-tighter">GiGs</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'seekers' ? null : 'seekers')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'seekers' ? 'scale-110' : 'hover:scale-105'}`}><Search className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Seekers</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'profile' ? null : 'profile')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'profile' ? 'scale-110' : 'hover:scale-105'}`}><UserCircle2 className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Profile</span></button>
            </>
          ) : (
            <>
              <button onClick={() => setActiveTab(prev => prev === 'seekers' ? null : 'seekers')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'seekers' ? 'scale-110' : 'hover:scale-105'}`}><Search className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Seekers</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'gigs' ? null : 'gigs')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'gigs' ? 'scale-110' : 'hover:scale-105'}`}><HardHat className="w-8 h-8" /><span className="text-[8px] font-black uppercase tracking-tighter">GiGs</span></button>
              <button onClick={() => setActiveTab(prev => prev === 'profile' ? null : 'profile')} className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all text-black ${activeTab === 'profile' ? 'scale-110' : 'hover:scale-105'}`}><UserCircle2 className="w-5 h-5" /><span className="text-[8px] font-black uppercase tracking-tighter">Profile</span></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
