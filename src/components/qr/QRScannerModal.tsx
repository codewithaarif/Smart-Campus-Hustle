import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { QrCode, X, CheckCircle2, AlertTriangle, Camera, KeyRound, ScanLine } from 'lucide-react';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
}

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose }) => {
  const { tenant, user } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [scanType, setScanType] = useState<'IDENTITY' | 'VISITOR' | 'EMERGENCY_OVERRIDE'>('IDENTITY');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);

  // Emergency override state
  const [officerPin, setOfficerPin] = useState('');
  const [dualWitness, setDualWitness] = useState('');
  const [studentUnivId, setStudentUnivId] = useState('');

  useEffect(() => {
    if (!isOpen) stopCameraRef.current?.();
  }, [isOpen]);

  useEffect(() => () => stopCameraRef.current?.(), []);

  if (!isOpen) return null;

  const startCamera = async () => {
    setCameraError('');
    setResult(null);
    const Detector = (globalThis as typeof globalThis & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    if (!Detector) {
      setCameraError('QR scanning is not supported in this browser. Paste the token below instead.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable. Use HTTPS or localhost, or paste the token below.');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    const stopCamera = () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
    };
    stopCameraRef.current = stopCamera;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } }
      });
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) throw new Error('Camera preview could not be initialized.');
      video.srcObject = stream;
      await video.play();
      setCameraActive(true);

      const detector = new Detector({ formats: ['qr_code'] });
      while (!cancelled) {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(video);
          const value = codes.find((code) => code.rawValue.trim())?.rawValue;
          if (value) {
            setTokenInput(value);
            stopCamera();
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    } catch (error) {
      stopCamera();
      setCameraError(error instanceof Error ? error.message : 'Unable to start the camera.');
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setResult(null);

    try {
      if (scanType === 'IDENTITY') {
        const res = await fetch('/api/identity/verify-qr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenant?.id || 'tenant_apex',
            Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
          },
          body: JSON.stringify({ qrToken: tokenInput.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `Verification failed (${res.status})`);
        setResult({
          type: 'IDENTITY',
          ...data
        });
      } else if (scanType === 'VISITOR') {
        const res = await fetch('/api/visitors/verify-gate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenant?.id || 'tenant_apex',
            Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
          },
          body: JSON.stringify({ passQrCode: tokenInput.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `Verification failed (${res.status})`);
        setResult({
          type: 'VISITOR',
          ...data
        });
      } else if (scanType === 'EMERGENCY_OVERRIDE') {
        const res = await fetch('/api/mobile/emergency-override', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenant?.id || 'tenant_apex',
            Authorization: 'Bearer ' + localStorage.getItem('smart_campus_token')
          },
          body: JSON.stringify({
            dualWitnessId: dualWitness,
            officerPin,
            reason: 'Network outage turnstile clearance protocol',
            studentUniversityId: studentUnivId
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || `Verification failed (${res.status})`);
        setResult({
          type: 'EMERGENCY_OVERRIDE',
          ...data
        });
      }
    } catch (err: any) {
      setResult({ valid: false, error: 'SCAN_FAILED', message: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleSampleToken = async () => {
    // Generate fresh live dynamic token from server for instant testing
    const res = await fetch('/api/identity/card', {
      headers: {
        'X-Tenant-ID': tenant?.id || 'tenant_apex',
        'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      setTokenInput(data.dynamicQR?.token || '');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-campus-600 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Campus Security QR & Turnstile Scanner</h3>
              <p className="text-xs text-slate-400">Modules 3, 17 & 20 Gate Clearance Protocol</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
          <button
            onClick={() => { stopCameraRef.current?.(); setScanType('IDENTITY'); setResult(null); setCameraError(''); }}
            className={`flex-1 py-3 border-b-2 transition-colors ${
              scanType === 'IDENTITY' ? 'border-campus-600 text-campus-700 bg-white font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Digital ID Scanner
          </button>
          <button
            onClick={() => { stopCameraRef.current?.(); setScanType('VISITOR'); setResult(null); setCameraError(''); }}
            className={`flex-1 py-3 border-b-2 transition-colors ${
              scanType === 'VISITOR' ? 'border-campus-600 text-campus-700 bg-white font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Visitor Pass Verify
          </button>
          <button
            onClick={() => { stopCameraRef.current?.(); setScanType('EMERGENCY_OVERRIDE'); setResult(null); setCameraError(''); }}
            className={`flex-1 py-3 border-b-2 transition-colors ${
              scanType === 'EMERGENCY_OVERRIDE' ? 'border-red-600 text-red-700 bg-white font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Outage Override
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {scanType !== 'EMERGENCY_OVERRIDE' ? (
            <>
              <div className="relative h-52 rounded-2xl bg-slate-900 border border-campus-500/50 flex items-center justify-center text-white overflow-hidden">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`absolute inset-0 h-full w-full object-cover ${cameraActive ? '' : 'hidden'}`}
                />
                {!cameraActive && (
                  <div className="flex flex-col items-center gap-2">
                    <ScanLine className="h-14 w-14 text-campus-300" />
                    <span className="text-[11px] text-slate-300 font-mono">Start camera to scan a QR code</span>
                  </div>
                )}
                {cameraActive && <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-campus-300" />}
              </div>
              <button
                type="button"
                onClick={cameraActive ? () => stopCameraRef.current?.() : startCamera}
                className="w-full rounded-xl border border-campus-200 bg-campus-50 px-3 py-2 text-xs font-semibold text-campus-800 hover:bg-campus-100"
              >
                {cameraActive ? 'Stop camera' : 'Scan with camera'}
              </button>
              {cameraError && <p role="status" className="text-xs text-amber-700">{cameraError}</p>}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">QR Code Payload / Token String</label>
                  {scanType === 'IDENTITY' && (
                    <button
                      onClick={handleSampleToken}
                      className="text-[11px] text-campus-600 hover:underline font-medium"
                    >
                      Fetch My Live Token
                    </button>
                  )}

                </div>
                <textarea
                  rows={2}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={scanType === 'IDENTITY' ? 'Paste the dynamic ID token...' : 'Paste an approved visitor pass code'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-campus-500"
                />
              </div>
            </>
          ) : (
            /* Emergency Gate Pass Outage Override Form */
            <div className="bg-red-50/60 border border-red-200 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-red-900 font-bold">
                <KeyRound className="w-4 h-4 text-red-600" />
                Server-Verified Emergency Override (Module 20)
              </div>
              <p className="text-[11px] text-red-700">
                Offline cached passes are never proof of entry. This override records an authorized decision in the campus server and therefore requires server connectivity; physical gate control is not integrated.
              </p>
              <div>
                <label className="font-medium text-slate-700 block mb-1">Student University ID</label>
                <input
                  type="text"
                  value={studentUnivId}
                  onChange={(e) => setStudentUnivId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Witness Officer ID</label>
                  <input
                    type="text"
                    value={dualWitness}
                    onChange={(e) => setDualWitness(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Emergency PIN</label>
                  <input
                    type="password"
                    value={officerPin}
                    onChange={(e) => setOfficerPin(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleVerify}
            disabled={verifying || (scanType !== 'EMERGENCY_OVERRIDE' && !tokenInput.trim())}
            className={`w-full py-3 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              scanType === 'EMERGENCY_OVERRIDE'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-campus-600 hover:bg-campus-700'
            } disabled:opacity-40`}
          >
            {verifying ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>Verifying Cryptographic Credentials...</span>
              </>
            ) : (
              <span>Verify Server Credential</span>
            )}
          </button>

          {/* Verification Result Feedback */}
          {result && (
            <div className={`p-4 rounded-2xl text-xs border animate-in fade-in ${
              result.valid || result.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-red-50 border-red-200 text-red-950'
            }`}>
              <div className="flex items-center gap-2 font-bold mb-1">
                {result.valid || result.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>CREDENTIAL VERIFIED</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>ACCESS DENIED ({result.error || 'INVALID'})</span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-slate-600">
                {result.message || (result.user && `Verified student: ${result.user.name} (${result.user.university_id})`)}
              </div>
              {(result.valid || result.success) && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Credential verification succeeded. Physical turnstile control must be connected separately.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
