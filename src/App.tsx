import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import "./App.css";

interface VideoTask {
  path: string;
  name: string;
  prompt: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'review'>('image');
  const [status, setStatus] = useState<any[]>([]);
  const [logs, setLogs] = useState("System Ready.");
  
  // Image Dispatcher State
  const [imgPrompt, setImgPrompt] = useState("");

  // Video Dispatcher State
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
  const [globalVideoPrompt, setGlobalVideoPrompt] = useState("");

  // Review State
  const [outboxJobs, setOutboxJobs] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobImages, setJobImages] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

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
    // Format: Channel__ID__Name (für Image egal, aber wir halten es sauber)
    const jobId = `General__img_${Date.now()}__ImageJob`;
    setLogs(`Sending IMAGE Job...`);
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

  // --- REVIEW LOGIC ---
  async function loadOutbox() {
      try {
          const jobs = await invoke("get_outbox_jobs") as string[];
          setOutboxJobs(jobs);
      } catch(e) { console.error(e); }
  }

  async function selectJobFolder(folderName: string) {
      setSelectedJob(folderName);
      setSelectedImages([]);
      try {
          const imgs = await invoke("get_job_images", { folderName }) as string[];
          setJobImages(imgs);
      } catch(e) { console.error(e); }
  }

  function toggleImageSelection(path: string) {
      if (selectedImages.includes(path)) {
          setSelectedImages(selectedImages.filter(p => p !== path));
      } else {
          setSelectedImages([...selectedImages, path]);
      }
  }

  async function convertSelectionToVideoJob() {
      if (selectedImages.length === 0 || !selectedJob) return;
      
      const parts = selectedJob.split("__");
      const channel = parts.length >= 3 ? parts[0] : "General";
      const timestamp = Date.now();
      
      // WICHTIG: Das Format muss Channel__ID__Name sein!
      const jobId = `${channel}__${timestamp}__FromImage`;

      const tasks: VideoTask[] = selectedImages.map(path => ({
          path: path,
          name: path.split(/[\\/]/).pop() || "unknown.png",
          prompt: globalVideoPrompt || "Cinematic motion" 
      }));

      setLogs(`Promoting to Video Job (${channel})...`);
      
      try {
          await invoke("dispatch_video_job", {
              workerId: "worker001",
              jobId: jobId,
              tasks: tasks
          });
          setLogs(`✅ Created Video Job! Files moved to inbox.`);
          setSelectedImages([]);
      } catch (e) { setLogs(`❌ Error: ${e}`); }
  }


  // --- VIDEO DISPATCHER LOGIC ---
  async function pickFiles() {
    try {
      const selected = await open({ multiple: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
      if (Array.isArray(selected)) {
        const newTasks = selected.map((path: string) => ({
            path: path,
            name: path.split(/[\\/]/).pop() || "unknown.png",
            prompt: globalVideoPrompt 
        }));
        setVideoTasks([...videoTasks, ...newTasks]);
      } 
    } catch (err) { setLogs("Error: " + err); }
  }

  async function dispatchVideo() {
    if (videoTasks.length === 0) return;
    
    // WICHTIG: Auch hier das korrekte Format für den Daemon!
    const jobId = `General__${Date.now()}__ManualUpload`;
    
    setLogs(`Sending VIDEO Job...`);
    try {
      await invoke("dispatch_video_job", { workerId: "worker001", jobId, tasks: videoTasks });
      setLogs(`✅ Video Job dispatched!`);
      setVideoTasks([]); 
    } catch (e) { setLogs(`❌ Error: ${e}`); }
  }

  return (
    <div className="container">
      <h1>🎛️ RenderFleet Operator</h1>

      {/* STATUS BOARD */}
      <div className="status-board">
        {status.map((w) => (
          <div key={w.workerId} className={`card ${w.status === "BUSY" ? "busy" : "idle"}`}>
            <div className="card-header"><span className="dot"></span><strong>{w.workerId}</strong></div>
            <div className="card-body">Status: <b>{w.status}</b></div>
          </div>
        ))}
      </div>

      <div className="tabs">
        <button className={activeTab === 'image' ? 'active' : ''} onClick={() => setActiveTab('image')}>📸 Image</button>
        <button className={activeTab === 'review' ? 'active' : ''} onClick={() => { setActiveTab('review'); loadOutbox(); }}>👁️ Review & Animate</button>
        <button className={activeTab === 'video' ? 'active' : ''} onClick={() => setActiveTab('video')}>🎬 Video Upload</button>
      </div>

      <div className="workspace">
        {/* IMAGE MODE */}
        {activeTab === 'image' && (
          <div className="dispatch-box">
            <h2>Image Dispatcher</h2>
            <textarea rows={5} placeholder="Enter prompt..." value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} />
            <button className="btn-primary" onClick={dispatchImage}>🚀 Dispatch Image</button>
          </div>
        )}

        {/* REVIEW MODE */}
        {activeTab === 'review' && (
          <div className="review-layout">
             <div className="sidebar">
                 <h3>Outbox Jobs</h3>
                 <button onClick={loadOutbox} className="btn-small">🔄 Refresh</button>
                 <div className="job-list">
                     {outboxJobs.map(job => (
                         <div key={job} className={`job-item ${selectedJob === job ? 'active' : ''}`} onClick={() => selectJobFolder(job)}>
                             {job}
                         </div>
                     ))}
                 </div>
             </div>
             
             <div className="gallery">
                 <div className="gallery-header">
                    <h3>{selectedJob ? selectedJob : "Select a job..."}</h3>
                    {selectedImages.length > 0 && (
                        <button className="btn-primary" style={{width: 'auto'}} onClick={convertSelectionToVideoJob}>
                            🎬 Animate {selectedImages.length} Selection(s)
                        </button>
                    )}
                 </div>
                 
                 <div className="global-prompt-mini">
                     <label>Video Prompt for selection:</label>
                     <input type="text" value={globalVideoPrompt} onChange={e => setGlobalVideoPrompt(e.target.value)} placeholder="E.g. Slow motion..." />
                 </div>

                 <div className="image-grid">
                     {jobImages.map(path => (
                         <div key={path} className={`img-card ${selectedImages.includes(path) ? 'selected' : ''}`} onClick={() => toggleImageSelection(path)}>
                             <img src={convertFileSrc(path)} alt="render" />
                             <div className="overlay">CLICK TO SELECT</div>
                         </div>
                     ))}
                 </div>
             </div>
          </div>
        )}

        {/* VIDEO UPLOAD MODE */}
        {activeTab === 'video' && (
          <div className="dispatch-box">
            <h2>Manual Video Upload</h2>
            <div style={{marginBottom:15}}><input type="text" placeholder="Global Prompt" value={globalVideoPrompt} onChange={e => setGlobalVideoPrompt(e.target.value)} /></div>
            <button onClick={pickFiles} style={{background: '#333', color:'white', padding:10, marginRight:10}}>📂 Add Files</button>
            <button className="btn-primary" onClick={dispatchVideo} disabled={videoTasks.length === 0}>🚀 Dispatch {videoTasks.length} Videos</button>
            <div className="file-list">
                {videoTasks.map((task, idx) => ( <div key={idx} className="file-row">{task.name}</div> ))}
            </div>
          </div>
        )}
      </div>

      <p className="logs">{logs}</p>
    </div>
  );
}

export default App;
