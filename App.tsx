import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";

// --- Type Definitions ---
interface AnalysisResponse {
  isTricolorPresent: boolean;
  reason: string;
  colorsFound: string[];
}

// --- Gemini Service ---
const analyzeImageForTricolor = async (imageDataUrl: string): Promise<AnalysisResponse> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  const base64Data = imageDataUrl.split(',')[1];

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64Data,
    },
  };

  const textPart = {
    text: `Analyze the image to detect the Indian tricolor flag pattern, which consists of three horizontal stripes in the exact sequence: saffron/orange at the top (RGB ~255,153,51), white in the middle (RGB 255,255,255), and green at the bottom (RGB ~19,136,8). The colors must appear as horizontal bands in this specific top-to-bottom order with approximately equal proportions in VERTICAL orientation only (reject any horizontal, diagonal, or other orientations), and can be present in actual flags, fabric, artwork, decorative items, or any object displaying this pattern, including partial views as long as the correct color sequence is maintained. Account for reasonable variations in color due to lighting, image quality, or printing differences. Respond ONLY with a JSON object: { "isTricolorPresent": boolean, "confidence": number, "reason": "detailed explanation of detection or absence", "colorsFound": ["array of detected tricolor colors using saffron/white/green"], "orientation": "vertical-correct/vertical-inverted/not-vertical" }`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-04-17',
    contents: { parts: [imagePart, textPart] },
    config: {
      responseMimeType: "application/json",
    }
  });

  let jsonStr = response.text.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }

  try {
    return JSON.parse(jsonStr) as AnalysisResponse;
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", jsonStr, e);
    throw new Error("Could not understand the AI's response.");
  }
};


// --- UI Components ---

const Header: React.FC = () => null;

const Footer: React.FC = () => (
  <footer className="p-4 text-center text-xs fixed bottom-0 left-0 right-0" style={{ backgroundColor: 'white', color: 'rgb(46,36,97)' }}>
    <p>The Minimalist ✖ Berger</p>
  </footer>
);

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onTakePicture: () => void;
  onCancel: () => void;
}

const CameraView: React.FC<CameraViewProps> = ({ videoRef, onTakePicture, onCancel }) => (
  <div className="relative w-full h-full flex flex-col items-center justify-center">
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
    />
    <button onClick={onCancel} aria-label="Cancel" className="absolute top-5 right-5 text-white bg-black/50 rounded-full p-2 z-20 hover:bg-black/75 transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    <div
      className="absolute left-0 right-0 flex justify-center items-center gap-4"
      style={{
        bottom: 0,
        padding: '1rem',
        paddingBottom: 'calc(2.5rem + 48px)', // 2.5rem (footer) + 48px (extra for mobile/desktop)
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <button
        onClick={onTakePicture}
        className="w-16 h-16 bg-white rounded-full border-4 border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white transition-transform transform active:scale-95"
        aria-label="Take Picture"
      >
      </button>
    </div>
  </div>
);


interface ResultViewProps {
  image: string;
  analysis: AnalysisResponse;
  onReset: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({ image, analysis, onReset }) => {
  const { isTricolorPresent, reason, colorsFound } = analysis;

  return (
    <div className="p-4 pt-24 pb-20 max-w-2xl mx-auto w-full">
      <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        <img src={image} alt="Captured" className="w-full h-auto" />
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            {isTricolorPresent ? (
              <span className="text-4xl">🇮🇳</span>
            ) : (
              <span className="text-4xl">❌</span>
            )}
            <h2 className={`text-2xl font-bold ${isTricolorPresent ? 'text-green-400' : 'text-red-400'}`}>
              {isTricolorPresent ? 'Tricolor Pattern Detected!' : 'No Tricolor Pattern Found'}
            </h2>
          </div>
          <p className="text-gray-300 mb-4">{reason}</p>
          {colorsFound && colorsFound.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2 text-gray-200">Colors Found:</h3>
              <div className="flex flex-wrap gap-2">
                {colorsFound.map(color => (
                  <span key={color} className="px-3 py-1 text-sm font-medium text-white bg-gray-700 rounded-full">
                    {color}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={onReset}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
          >
            Analyze Another Image
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Main App Component ---

type AppState = 'IDLE' | 'CAMERA_ACTIVE' | 'ANALYZING' | 'RESULT';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (appState !== 'CAMERA_ACTIVE') {
      stopCamera();
      return;
    }

    const initCamera = async () => {
      if (!videoRef.current) {
        console.error("Camera view is not ready.");
        setError("Camera component failed to load. Please refresh.");
        setAppState('IDLE');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.oncanplay = () => {
            videoRef.current?.play().catch(e => {
                console.error("Video play failed:", e)
                setError("Could not start camera video stream.");
                setAppState('IDLE');
            });
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Could not access the camera. Please check permissions and try again.');
        setAppState('IDLE');
      }
    };

    initCamera();

    return () => {
      stopCamera();
    };
  }, [appState, stopCamera]);


  const startCamera = () => {
    setError(null);
    setAppState('CAMERA_ACTIVE');
  };

  const handleTakePicture = useCallback(async () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageDataUrl);
        setAppState('ANALYZING');

        try {
          const result = await analyzeImageForTricolor(imageDataUrl);
          setAnalysis(result);
          setError(null);
        } catch (e) {
          console.error(e);
          const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
          setError(`Failed to analyze the image. ${errorMessage}`);
          setAnalysis(null);
        } finally {
          setAppState('RESULT');
        }
      }
    }
  }, []);

  const handleReset = () => {
    setCapturedImage(null);
    setAnalysis(null);
    setError(null);
    setAppState('IDLE');
  };

  const renderContent = () => {
    switch (appState) {
      case 'IDLE':
        return (
          <div className="flex flex-col items-center justify-center h-screen text-center p-4">
            {error && <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-6 max-w-md">{error}</div>}
            <img src="https://upload.wikimedia.org/wikipedia/commons/3/31/Berger.png" alt="Logo" className="w-48 h-48 object-contain mb-10" style={{ background: 'white', borderRadius: 16 }} />
            <h2 className="text-4xl font-extrabold mb-4">Detect Indian Tricolor</h2>
            <p className="text-lg text-gray-400 mb-8 max-w-xl">
              Use your camera to find the saffron, white, and green color combination in any object or scene. It doesn't have to be a flag!
            </p>
            <button
              onClick={startCamera}
              className="bg-white hover:bg-gray-200 text-[#2e2461] font-bold py-4 px-8 rounded-lg text-xl transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#2e2461] focus:ring-white shadow-lg"
            >
              Start Camera
            </button>
          </div>
        );
      case 'CAMERA_ACTIVE':
        return <CameraView videoRef={videoRef} onTakePicture={handleTakePicture} onCancel={handleReset} />;
      case 'ANALYZING':
        return (
           <div className="flex flex-col items-center justify-center h-screen">
            <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-xl text-gray-300">Analyzing image...</p>
           </div>
        );
      case 'RESULT':
        if (error) {
             return (
                 <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
                    <div className="bg-red-800/50 border border-red-700 text-red-200 p-6 rounded-lg max-w-md shadow-lg">
                        <h2 className="text-2xl font-bold mb-4">Analysis Failed</h2>
                        <p className="mb-6">{error}</p>
                        <button
                            onClick={handleReset}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
             )
        }
        if (capturedImage && analysis) {
          return <ResultView image={capturedImage} analysis={analysis} onReset={handleReset} />;
        }
        // Fallback to idle if something is wrong
        handleReset();
        return null;

      default:
        return null;
    }
  };

  return (
    <main className="h-screen w-screen font-sans overflow-auto" style={{ backgroundColor: 'rgb(46,36,97)', color: 'white' }}>
      <Header />
      <div className="h-full w-full">
        {renderContent()}
      </div>
      <Footer />
    </main>
  );
};

export default App;
