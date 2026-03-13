import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// ROS2 connection type
interface ROSConnection {
  connected: boolean
  ros: any
}

// Robot status type
interface RobotStatus {
  battery: number
  state: string
  position: { x: number, y: number, theta: number }
  velocity: { linear: number, angular: number }
}

// Map types
interface MapData {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  data: number[]
}

// Path type
interface Pose {
  x: number
  y: number
  theta: number
}

// ROS2 WebSocket URL configuration
const ROSBRIDGE_URL = 'ws://localhost:9090'

function App() {
  // ROS connection state
  const [rosConnected, setRosConnected] = useState(false)
  const [rosError, setRosError] = useState('')

  // Robot status state
  const [robotStatus, setRobotStatus] = useState<RobotStatus>({
    battery: 0,
    state: 'Offline',
    position: { x: 0, y: 0, theta: 0 },
    velocity: { linear: 0, angular: 0 }
  })

  // Map state
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [robotPose, setRobotPose] = useState<Pose>({ x: 0, y: 0, theta: 0 })
  const [pathPoints, setPathPoints] = useState<Pose[]>([])
  const [goalPose, setGoalPose] = useState<Pose | null>(null)
  const [mapReceived, setMapReceived] = useState(false)

  // Teleop state
  const [linearSpeed, setLinearSpeed] = useState(0.5)
  const [angularSpeed, setAngularSpeed] = useState(0.5)
  const [isMoving, setIsMoving] = useState(false)

  // Navigation state
  const [targetStation, setTargetStation] = useState('')
  const [tourSequence, setTourSequence] = useState<number[]>([])
  const [isNavigating, setIsNavigating] = useState(false)

  // Logs
  const [logs, setLogs] = useState<string[]>([])

  // ROS objects refs
  const rosRef = useRef<any>(null)
  const cmdVelRef = useRef<any>(null)
  const stationPubRef = useRef<any>(null)
  const goalPubRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapScaleRef = useRef<number>(30)
  const mapOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 })

  // Add log message
  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-19), `[${timestamp}] ${msg}`])
  }, [])

  // Draw map on canvas
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!mapData) {
      ctx.fillStyle = '#a0a0a0'
      ctx.font = '14px Segoe UI'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for map data...', canvas.width / 2, canvas.height / 2)
      ctx.fillText('Connect to ROS bridge', canvas.width / 2, canvas.height / 2 + 20)
      return
    }

    // Calculate scale and offset to fit map in canvas
    const mapWidthPx = mapData.width
    const mapHeightPx = mapData.height
    const scaleX = canvas.width / mapWidthPx
    const scaleY = canvas.height / mapHeightPx
    const scale = Math.min(scaleX, scaleY) * 0.9

    mapScaleRef.current = scale

    const offsetX = (canvas.width - mapWidthPx * scale) / 2
    const offsetY = (canvas.height - mapHeightPx * scale) / 2
    mapOffsetRef.current = { x: offsetX, y: offsetY }

    // Draw map cells
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const idx = y * mapData.width + x
        const value = mapData.data[idx]

        if (value === -1) {
          // Unknown - transparent
          continue
        } else if (value === 0) {
          // Free space - light gray
          ctx.fillStyle = '#e0e0e0'
        } else if (value === 100) {
          // Obstacle - dark gray
          ctx.fillStyle = '#333333'
        } else {
          // Interpolate
          const gray = 255 - (value * 255 / 100)
          ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
        }

        ctx.fillRect(
          offsetX + x * scale,
          offsetY + (mapData.height - 1 - y) * scale,
          scale + 0.5,
          scale + 0.5
        )
      }
    }

    // Draw path
    if (pathPoints.length > 0) {
      ctx.strokeStyle = '#00d9ff'
      ctx.lineWidth = 3
      ctx.beginPath()
      pathPoints.forEach((point, idx) => {
        const px = offsetX + (point.x - mapData.originX) / mapData.resolution * scale
        const py = offsetY + (mapData.height - (point.y - mapData.originY) / mapData.resolution) * scale
        if (idx === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      })
      ctx.stroke()
    }

    // Draw goal marker
    if (goalPose) {
      const goalX = offsetX + (goalPose.x - mapData.originX) / mapData.resolution * scale
      const goalY = offsetY + (mapData.height - (goalPose.y - mapData.originY) / mapData.resolution) * scale

      // Draw goal circle
      ctx.fillStyle = '#ffa500'
      ctx.beginPath()
      ctx.arc(goalX, goalY, 12, 0, Math.PI * 2)
      ctx.fill()

      // Draw goal cross
      ctx.strokeStyle = '#ffa500'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(goalX - 8, goalY)
      ctx.lineTo(goalX + 8, goalY)
      ctx.moveTo(goalX, goalY - 8)
      ctx.lineTo(goalX, goalY + 8)
      ctx.stroke()

      // Draw label
      ctx.fillStyle = '#ffa500'
      ctx.font = 'bold 12px Segoe UI'
      ctx.textAlign = 'center'
      ctx.fillText('GOAL', goalX, goalY - 18)
    }

    // Draw robot (yellow smiley)
    const robotX = offsetX + (robotPose.x - mapData.originX) / mapData.resolution * scale
    const robotY = offsetY + (mapData.height - (robotPose.y - mapData.originY) / mapData.resolution) * scale

    ctx.save()
    ctx.translate(robotX, robotY)
    ctx.rotate(-robotPose.theta)

    // Draw smiley face
    const robotSize = 20

    // Face circle
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(0, 0, robotSize, 0, Math.PI * 2)
    ctx.fill()

    // Eyes
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(-6, -5, 3, 0, Math.PI * 2)
    ctx.arc(6, -5, 3, 0, Math.PI * 2)
    ctx.fill()

    // Smile
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 2, 10, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.stroke()

    ctx.restore()

  }, [mapData, robotPose, pathPoints, goalPose])

  // Redraw map when data changes
  useEffect(() => {
    drawMap()
  }, [drawMap])

  // Handle canvas click for goal setting
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mapData || !rosRef.current || !goalPubRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const offset = mapOffsetRef.current
    const scale = mapScaleRef.current

    // Convert pixel to map coordinates
    const mapX = (clickX - offset.x) / scale * mapData.resolution + mapData.originX
    const mapY = ((mapData.height * mapData.resolution) - (clickY - offset.y) / scale * mapData.resolution) + mapData.originY

    setGoalPose({ x: mapX, y: mapY, theta: 0 })
    addLog(`Goal set at (${mapX.toFixed(2)}, ${mapY.toFixed(2)})`)

    // Publish goal to ROS
    const goalMsg = {
      header: {
        stamp: { sec: 0, nanosec: 0 },
        frame_id: 'map'
      },
      pose: {
        position: { x: mapX, y: mapY, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      }
    }

    goalPubRef.current.publish(goalMsg)
    addLog('Navigation goal sent!')

  }, [mapData, addLog])

  // Initialize ROS connection
  useEffect(() => {
    const initROS = async () => {
      try {
        const ROSLIB = await import('roslib')

        // Make ROSLIB available globally
        ;(window as any).ROSLIB = ROSLIB

        const ros = new ROSLIB.Ros({
          url: ROSBRIDGE_URL
        })

        ros.on('connection', () => {
          setRosConnected(true)
          setRosError('')
          addLog('Connected to ROS2 bridge')

          // Initialize publishers
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

          // Goal publisher for map clicks
          goalPubRef.current = new ROSLIB.Topic({
            ros: ros,
            name: '/goal_pose',
            messageType: 'geometry_msgs/PoseStamped'
          })

          // Subscribe to map
          const mapSub = new ROSLIB.Topic({
            ros: ros,
            name: '/map',
            messageType: 'nav_msgs/OccupancyGrid'
          })

          mapSub.subscribe((msg: any) => {
            setMapData({
              width: msg.info.width,
              height: msg.info.height,
              resolution: msg.info.resolution,
              originX: msg.info.origin.position.x,
              originY: msg.info.origin.position.y,
              data: msg.data
            })
            setMapReceived(true)
            addLog('Map data received')
          })

          // Subscribe to amcl_pose for accurate robot position
          const amclSub = new ROSLIB.Topic({
            ros: ros,
            name: '/amcl_pose',
            messageType: 'geometry_msgs/PoseWithCovarianceStamped'
          })

          amclSub.subscribe((msg: any) => {
            const pose = msg.pose.pose
            setRobotPose({
              x: pose.position.x,
              y: pose.position.y,
              theta: Math.atan2(
                2 * (pose.orientation.w * pose.orientation.z),
                1 - 2 * pose.orientation.z * pose.orientation.z
              )
            })
          })

          // Subscribe to odom as fallback
          const odomSub = new ROSLIB.Topic({
            ros: ros,
            name: '/odom',
            messageType: 'nav_msgs/Odometry'
          })

          odomSub.subscribe((msg: any) => {
            // Only use odom if we haven't received amcl pose yet
            if (robotPose.x === 0 && robotPose.y === 0) {
              setRobotPose({
                x: msg.pose.pose.position.x,
                y: msg.pose.pose.position.y,
                theta: Math.atan2(
                  2 * (msg.pose.pose.orientation.w * msg.pose.pose.orientation.z),
                  1 - 2 * msg.pose.pose.orientation.z * msg.pose.pose.orientation.z
                )
              })
            }
          })

          // Subscribe to planned path
          const pathSub = new ROSLIB.Topic({
            ros: ros,
            name: '/plan',
            messageType: 'nav_msgs/Path'
          })

          pathSub.subscribe((msg: any) => {
            const points = msg.poses.map((p: any) => ({
              x: p.pose.position.x,
              y: p.pose.position.y,
              theta: 0
            }))
            setPathPoints(points)
            addLog(`Path received: ${points.length} points`)
          })

          // Subscribe to battery
          const batterySub = new ROSLIB.Topic({
            ros: ros,
            name: '/battery_state',
            messageType: 'sensor_msgs/BatteryState'
          })

          batterySub.subscribe((msg: any) => {
            const percentage = msg.percentage !== undefined ? msg.percentage * 100 : msg.power_supply_percentage * 100
            setRobotStatus(prev => ({
              ...prev,
              battery: Math.round(percentage)
            }))
          })

          // Subscribe to robot state
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

    return () => {
      if (rosRef.current) {
        rosRef.current.close()
      }
    }
  }, [addLog, robotPose])

  // Teleop control functions
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

  // Navigation functions
  const goToStation = useCallback(() => {
    if (!targetStation) return
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({
        data: parseInt(targetStation)
      })
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
      const msg = new (window as any).ROSLIB.Message({
        data: tourSequence[0]
      })
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
      const msg = new (window as any).ROSLIB.Message({
        data: 0
      })
      stationPubRef.current.publish(msg)
      addLog('Returning to home position')
      setIsNavigating(true)
    }
  }, [addLog])

  const goToCharge = useCallback(() => {
    if (stationPubRef.current) {
      const msg = new (window as any).ROSLIB.Message({
        data: -1
      })
      stationPubRef.current.publish(msg)
      addLog('Going to charging station')
      setIsNavigating(true)
    }
  }, [addLog])

  const clearGoal = useCallback(() => {
    setGoalPose(null)
    setPathPoints([])
    addLog('Goal cleared')
  }, [addLog])

  return (
    <div className="app-container">
      {/* Header - Status Bar */}
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

      {/* Main Content */}
      <main className="main-content">
        {/* Left Panel - Map/Status */}
        <div className="left-panel">
          <div className="panel map-panel">
            <h2>Map View</h2>
            <div className="position-display">
              <div className="position-item">
                <span className="label">X:</span>
                <span className="value">{robotPose.x.toFixed(2)} m</span>
              </div>
              <div className="position-item">
                <span className="label">Y:</span>
                <span className="value">{robotPose.y.toFixed(2)} m</span>
              </div>
              <div className="position-item">
                <span className="label">θ:</span>
                <span className="value">{(robotPose.theta * 180 / Math.PI).toFixed(1)}°</span>
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
            <div className="map-container">
              <canvas
                ref={canvasRef}
                width={400}
                height={300}
                onClick={handleCanvasClick}
                className="map-canvas"
              />
              <div className="map-legend">
                <span className="legend-item">
                  <span className="legend-color" style={{ background: '#FFD700' }}></span>
                  Robot
                </span>
                <span className="legend-item">
                  <span className="legend-color" style={{ background: '#ffa500' }}></span>
                  Goal
                </span>
                <span className="legend-item">
                  <span className="legend-color" style={{ background: '#00d9ff' }}></span>
                  Path
                </span>
              </div>
              {goalPose && (
                <button className="clear-goal-btn" onClick={clearGoal}>
                  Clear Goal
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Controls */}
        <div className="right-panel">
          {/* Teleop Control */}
          <div className="panel teleop-panel">
            <h2>Teleop Control</h2>
            <div className="speed-controls">
              <div className="speed-slider">
                <label>Linear Speed: {linearSpeed.toFixed(1)} m/s</label>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={linearSpeed}
                  onChange={(e) => setLinearSpeed(parseFloat(e.target.value))}
                />
              </div>
              <div className="speed-slider">
                <label>Angular Speed: {angularSpeed.toFixed(1)} rad/s</label>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={angularSpeed}
                  onChange={(e) => setAngularSpeed(parseFloat(e.target.value))}
                />
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

          {/* Navigation Control */}
          <div className="panel nav-panel">
            <h2>Navigation</h2>
            <div className="station-input">
              <input
                type="number"
                placeholder="Enter station number"
                value={targetStation}
                onChange={(e) => setTargetStation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goToStation()}
              />
              <button onClick={goToStation} disabled={!targetStation || isNavigating}>
                Go
              </button>
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
                <button onClick={startTour} disabled={tourSequence.length === 0 || isNavigating}>
                  Start Tour
                </button>
                <button onClick={clearSequence} disabled={tourSequence.length === 0}>Clear</button>
              </div>
            </div>
            <div className="quick-actions">
              <button className="action-btn home" onClick={returnHome}>
                🏠 Home
              </button>
              <button className="action-btn charge" onClick={goToCharge}>
                🔌 Charge
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - Log Console */}
      <footer className="log-console">
        <h3>System Logs</h3>
        <div className="log-content">
          {logs.map((log, idx) => (
            <div key={idx} className="log-entry">{log}</div>
          ))}
          {logs.length === 0 && <div className="log-entry">System ready...</div>}
        </div>
      </footer>

      {rosError && (
        <div className="error-toast">
          {rosError}
        </div>
      )}
    </div>
  )
}

export default App
