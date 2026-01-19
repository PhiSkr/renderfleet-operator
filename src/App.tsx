import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import "./App.css";

interface VideoTask {
  path: string;
  name: string;
  prompt: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [status, setStatus] = useState<any[]>([]);
  const [logs, setLogs] = useState("System Ready.");
  
  // Image State
  const [imgPrompt, setImgPrompt] = useState("");

  // Video State
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
  const [globalVideoPrompt, setGlobalVideoPrompt] = useState(""); // Hier war der Fehler

  // Heartbeat Loop
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const fleets = await invoke("get_fleet_status");
        const parsed = (fleets as string[]).map((s) => JSON.parse(s));
        setStatus(parsed);
      } catch (e) { console.error(e); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---

  async function dispatchImage() {
    if (!imgPrompt.trim()) return;
    const jobId = `job_img_${Date.now()}`;
    setLogs(`Sending IMAGE Job ${jobId}...`);
    try {
      await invoke("dispatch_image_job", {
        workerId: "worker001",
        jobId: jobId,
        prompt: imgPrompt,
      });
      setLogs(`✅ Image Job dispatched!`);
      setImgPrompt("");
    } catch (e) { setLogs(`❌ Error: ${e}`); }
  }

  async function pickFiles() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      
      if (Array.isArray(selected)) {
        const newTasks = selected.map((path: string) => ({
            path: path,
            name: path.split(/[\\/]/).pop() || "unknown.png",
            prompt: globalVideoPrompt 
        }));
        setVideoTasks([...videoTasks, ...newTasks]);
      } 
    } catch (err) {
      console.error(err);
      setLogs("Error picking files: " + err);
    }
  }

  async function dispatchVideo() {
    if (videoTasks.length === 0) return;
    const jobId = `job_vid_${Date.now()}`;
    setLogs(`Sending VIDEO Job ${jobId} with ${videoTasks.length} clips...`);

    try {
      await invoke("dispatch_video_job", {
        workerId: "worker001",
        jobId: jobId,
        tasks: videoTasks
      });
      setLogs(`✅ Video Job dispatched! Check Processing.`);
      setVideoTasks([]); 
    } catch (e) { setLogs(`❌ Error: ${e}`); }
  }

  const updateTaskPrompt = (index: number, newPrompt: string) => {
    const updated = [...videoTasks];
    updated[index].prompt = newPrompt;
    setVideoTasks(updated);
  };

  return (
    <div className="container">
      <h1>🎛️ RenderFleet Operator</h1>

      {/* STATUS BOARD */}
      <div className="status-board">
        {status.length === 0 && <p className="loading">Searching for fleet...</p>}
        {status.map((w) => (
          <div key={w.workerId} className={`card ${w.status === "BUSY" ? "busy" : "idle"}`}>
            <div className="card-header"><span className="dot"></span><strong>{w.workerId}</strong></div>
            <div className="card-body">Status: <b>{w.status}</b><br/><small>{w.roles.join(", ")}</small></div>
          </div>
        ))}
      </div>

      <div className="tabs">
        <button className={activeTab === 'image' ? 'active' : ''} onClick={() => setActiveTab('image')}>📸 Image Mode</button>
        <button className={activeTab === 'video' ? 'active' : ''} onClick={() => setActiveTab('video')}>🎬 Video Mode</button>
      </div>

      <div className="workspace">
        {/* IMAGE MODE */}
        {activeTab === 'image' && (
          <div className="dispatch-box">
            <h2>Image Dispatcher</h2>
            <textarea
              rows={5}
              placeholder="Enter prompt..."
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
            />
            <button className="btn-primary" onClick={dispatchImage}>🚀 Dispatch Image</button>
          </div>
        )}

        {/* VIDEO MODE */}
        {activeTab === 'video' && (
          <div className="dispatch-box">
            <h2>Video Dispatcher</h2>
            
            {/* HIER IST DAS NEUE FELD, DAS DEN FEHLER BEHEBT: */}
            <div style={{marginBottom: '15px', padding: '10px', background: '#222', borderRadius: '4px'}}>
                <label style={{display: 'block', marginBottom: '5px', color: '#888', fontSize: '0.9em'}}>Global Prompt (Applied to new files):</label>
                <input 
                    type="text" 
                    placeholder="e.g. Cinematic 4k, slow motion..."
                    value={globalVideoPrompt}
                    onChange={(e) => setGlobalVideoPrompt(e.target.value)}
                />
            </div>

            <div className="controls">
                <button onClick={pickFiles} style={{background: '#333', border: '1px solid #555', color: 'white', padding: '10px', cursor: 'pointer'}}>📂 Add Files</button>
                <button className="btn-primary" onClick={dispatchVideo} disabled={videoTasks.length === 0}>
                    🚀 Dispatch {videoTasks.length} Videos
                </button>
            </div>

            <div className="file-list">
                {videoTasks.length === 0 && <p style={{color: '#555', marginTop: 20}}>No files selected. Click 'Add Files'.</p>}
                
                {videoTasks.map((task, idx) => (
                    <div key={idx} className="file-row">
                        <div className="file-info">
                           <span className="filename">{task.name}</span>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Specific prompt for this shot..."
                            value={task.prompt}
                            onChange={(e) => updateTaskPrompt(idx, e.target.value)}
                        />
                        <button className="btn-small" onClick={() => {
                            const n = [...videoTasks]; n.splice(idx, 1); setVideoTasks(n);
                        }}>✕</button>
                    </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <p className="logs">{logs}</p>
    </div>
  );
}

export default App;
