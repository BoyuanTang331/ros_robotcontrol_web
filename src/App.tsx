import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

interface ROSConnection {
  connected: boolean
  ros: any
}

interface RobotStatus {
  battery: number
  state: string
  position: { x: number, y: number, theta: number }
  velocity: { linear: number, angular: number }
}

const ROSBRIDGE_URL = 'ws://localhost:9090'

function App() {
  const [rosConnected, setRosConnected] = useState(false)
  const [rosError, setRosError] = useState('')

  const [robotStatus, setRobotStatus] = useState<RobotStatus>({
    battery: 0,
    state: 'Offline',
    position: { x: 0, y: 0, theta: 0 },
    velocity: { linear: 0, angular: 0 }
  })

  const [linearSpeed, setLinearSpeed] = useState(0.5)
  const [angularSpeed, setAngularSpeed] = useState(0.5)
  const [isMoving, setIsMoving] = useState(false)

  const [targetStation, setTargetStation] = useState('')
  const [tourSequence, setTourSequence] = useState<number[]>([])
  const [isNavigating, setIsNavigating] = useState(false)

  const [logs, setLogs] = useState<string[]>([])

  const rosRef = useRef<any>(null)
  const cmdVelRef = useRef<any>(null)
  const stationPubRef = useRef<any>(null)

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-19), `[${timestamp}] ${msg}`])
  }, [])

  useEffect(() => {
    const initROS = async () => {
      try {
        const ROSLIB = await import('roslib')
        const ros = new ROSLIB.Ros({ url: ROSBRIDGE_URL })

        ros.on('connection', () => {
          setRosConnected(true)
          setRosError('')
          addLog('Connected to ROS2 bridge')

          cmdVelRef.current = new ROSLIB.Topic({
            ros: ros,
            name: '/cmd_vel',
            messageType: 'geometry_msgs/Twist'
          })

          stationPubRef.current = new ROSLIB.Topic({
            ros: ros,
            name: '/station_arrival',
            messageType: 'std_msgs/Int32'
          })

          const batterySub = new ROSLIB.Topic({
            ros: ros,
            name: '/battery_state',
            messageType: 'sensor_msgs/BatteryState'
          })
          batterySub.subscribe((msg: any) => {
            setRobotStatus(prev => ({ ...prev, battery: Math.round(msg.percentage * 100) }))
          })

          const odomSub = new ROSLIB.Topic({
            ros: ros,
            name: '/odom',
            messageType: 'nav_msgs/Odometry'
          })
          odomSub.subscribe((msg: any) => {
            setRobotStatus(prev => ({
              ...prev,
              position: {
                x: msg.pose.pose.position.x,
                y: msg.pose.pose.position.y,
                theta: Math.atan2(2 * (msg.pose.pose.orientation.w * msg.pose.pose.orientation.z), 1 - 2 * msg.pose.pose.orientation.z * msg.pose.pose.orientation.z)
              },
              velocity: {
                linear: msg.twist.twist.linear.x,
                angular: msg.twist.twist.angular.z
              }
            }))
          })

          const stateSub = new ROSLIB.Topic({
            ros: ros,
            name: '/robot_state',
            messageType: 'std_msgs/String'
          })
          stateSub.subscribe((msg: any) => {
            setRobotStatus(prev => ({ ...prev, state: msg.data }))
          })
        })

        ros.on('error', (error: any) => {
          setRosError(`ROS Error: ${error}`)
          addLog(`ROS connection error: ${error}`)
        })

        ros.on('close', () => {
          setRosConnected(false)
          addLog('Disconnected from ROS2 bridge')
        })

        rosRef.current = ros
      } catch (error) {
        setRosError(`Failed to load roslib: ${error}`)
        addLog(`Failed to load roslib: ${error}`)
      }
    }

    initROS()
    return () => { if (rosRef.current) { rosRef.current.close() } }
  }, [addLog])

  const moveForward = useCallback(() => {
    if (!cmdVelRef.current) return
    const cmd = new (window as any).ROSLIB.Message({
      linear: { x: linearSpeed, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    })
    cmdVelRef.current.publish(cmd)
    setIsMoving(true)
    addLog(`Moving forward at ${linearSpeed} m/s`)
  }, [linearSpeed, addLog])

  const moveBackward = useCallback(() => {
    if (!cmdVelRef.current) return
    const cmd = new (window as any).ROSLIB.Message({
      linear: { x: -linearSpeed, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    })
    cmdVelRef.current.publish(cmd)
    setIsMoving(true)
    addLog(`Moving backward at ${linearSpeed} m/s`)
  }, [linearSpeed, addLog])

  const turnLeft = useCallback(() => {
    if (!cmdVelRef.current) return
    const cmd = new (window as any).ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularSpeed }
    })
    cmdVelRef.current.publish(cmd)
    setIsMoving(true)
    addLog(`Turning left at ${angularSpeed} rad/s`)
  }, [angularSpeed, addLog])

  const turnRight = useCallback(() => {
    if (!cmdVelRef.current) return
    const cmd = new (window as any).ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -angularSpeed }
    })
    cmdVelRef.current.publish(cmd)
    setIsMoving(true)
    addLog(`Turning right at ${angularSpeed} rad/s`)
  }, [angularSpeed, addLog])

  const stopRobot = useCallback(() => {
    if (!cmdVelRef.current) return
    const cmd = new (window as any).ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    })
    cmdVelRef.current.publish(cmd)
    setIsMoving(false)
    addLog('Robot stopped')
  }, [addLog])

  const goToStation = useCallback(() => {
    if (!targetStation) return
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({ data: parseInt(targetStation) })
      stationPubRef.current.publish(msg)
      addLog(`Navigating to station ${targetStation}`)
      setIsNavigating(true)
    }
  }, [targetStation, addLog])

  const addToSequence = useCallback(() => {
    const num = parseInt(targetStation)
    if (!isNaN(num)) {
      setTourSequence(prev => [...prev, num])
      setTargetStation('')
      addLog(`Added station ${num} to tour sequence`)
    }
  }, [targetStation, addLog])

  const startTour = useCallback(() => {
    if (tourSequence.length === 0) return
    addLog(`Starting tour: ${tourSequence.join(' -> ')}`)
    setIsNavigating(true)
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({ data: tourSequence[0] })
      stationPubRef.current.publish(msg)
    }
  }, [tourSequence, addLog])

  const clearSequence = useCallback(() => {
    setTourSequence([])
    setIsNavigating(false)
    addLog('Tour sequence cleared')
  }, [addLog])

  const returnHome = useCallback(() => {
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({ data: 0 })
      stationPubRef.current.publish(msg)
      addLog('Returning to home position')
      setIsNavigating(true)
    }
  }, [addLog])

  const goToCharge = useCallback(() => {
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({ data: -1 })
      stationPubRef.current.publish(msg)
      addLog('Going to charging station')
      setIsNavigating(true)
    }
  }, [addLog])

  return (
    <div className="app-container">
      <header className="status-bar">
        <div className="status-left">
          <h1>Merman M1 Control</h1>
        </div>
        <div className="status-right">
          <div className={`connection-status ${rosConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {rosConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className={`robot-state ${robotStatus.state.toLowerCase()}`}>
            State: {robotStatus.state}
          </div>
          <div className="battery-display">
            <span className="battery-icon">🔋</span>
            <span className={`battery-level ${robotStatus.battery < 20 ? 'low' : ''}`}>
              {robotStatus.battery}%
            </span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="left-panel">
          <div className="panel map-panel">
            <h2>Robot Status</h2>
            <div className="position-display">
              <div className="position-item">
                <span className="label">X:</span>
                <span className="value">{robotStatus.position.x.toFixed(2)} m</span>
              </div>
              <div className="position-item">
                <span className="label">Y:</span>
                <span className="value">{robotStatus.position.y.toFixed(2)} m</span>
              </div>
              <div className="position-item">
                <span className="label">θ:</span>
                <span className="value">{(robotStatus.position.theta * 180 / Math.PI).toFixed(1)}°</span>
              </div>
            </div>
            <div className="velocity-display">
              <div className="velocity-item">
                <span className="label">Linear:</span>
                <span className="value">{robotStatus.velocity.linear.toFixed(2)} m/s</span>
              </div>
              <div className="velocity-item">
                <span className="label">Angular:</span>
                <span className="value">{robotStatus.velocity.angular.toFixed(2)} rad/s</span>
              </div>
            </div>
            <div className="map-placeholder">
              <div className="robot-marker" style={{
                transform: `translate(-50%, -50%) rotate(${robotStatus.position.theta}rad)`
              }}>
                🤖
              </div>
              <p>Map View (ROS map topic)</p>
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="panel teleop-panel">
            <h2>Teleop Control</h2>
            <div className="speed-controls">
              <div className="speed-slider">
                <label>Linear Speed: {linearSpeed.toFixed(1)} m/s</label>
                <input type="range" min="0.1" max="2.0" step="0.1" value={linearSpeed}
                  onChange={(e) => setLinearSpeed(parseFloat(e.target.value))} />
              </div>
              <div className="speed-slider">
                <label>Angular Speed: {angularSpeed.toFixed(1)} rad/s</label>
                <input type="range" min="0.1" max="2.0" step="0.1" value={angularSpeed}
                  onChange={(e) => setAngularSpeed(parseFloat(e.target.value))} />
              </div>
            </div>
            <div className="teleop-buttons">
              <div className="dpad">
                <button className="dpad-btn up" onMouseDown={moveForward} onMouseUp={stopRobot} onMouseLeave={stopRobot}>▲</button>
                <button className="dpad-btn left" onMouseDown={turnLeft} onMouseUp={stopRobot} onMouseLeave={stopRobot}>◄</button>
                <button className="dpad-btn stop" onClick={stopRobot}>●</button>
                <button className="dpad-btn right" onMouseDown={turnRight} onMouseUp={stopRobot} onMouseLeave={stopRobot}>►</button>
                <button className="dpad-btn down" onMouseDown={moveBackward} onMouseUp={stopRobot} onMouseLeave={stopRobot}>▼</button>
              </div>
            </div>
          </div>

          <div className="panel nav-panel">
            <h2>Navigation</h2>
            <div className="station-input">
              <input type="number" placeholder="Enter station number" value={targetStation}
                onChange={(e) => setTargetStation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goToStation()} />
              <button onClick={goToStation} disabled={!targetStation || isNavigating}>Go</button>
            </div>
            <div className="tour-sequence">
              <h3>Tour Sequence</h3>
              <div className="sequence-list">
                {tourSequence.map((station, idx) => (
                  <span key={idx} className="sequence-item">{station}</span>
                ))}
                {tourSequence.length === 0 && <span className="empty">No stations added</span>}
              </div>
              <div className="sequence-controls">
                <button onClick={addToSequence} disabled={!targetStation}>+ Add</button>
                <button onClick={startTour} disabled={tourSequence.length === 0 || isNavigating}>Start Tour</button>
                <button onClick={clearSequence} disabled={tourSequence.length === 0}>Clear</button>
              </div>
            </div>
            <div className="quick-actions">
              <button className="action-btn home" onClick={returnHome}>🏠 Home</button>
              <button className="action-btn charge" onClick={goToCharge}>🔌 Charge</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="log-console">
        <h3>System Logs</h3>
        <div className="log-content">
          {logs.map((log, idx) => (
            <div key={idx} className="log-entry">{log}</div>
          ))}
          {logs.length === 0 && <div className="log-entry">System ready...</div>}
        </div>
      </footer>

      {rosError && <div className="error-toast">{rosError}</div>}
    </div>
  )
}

export default App
