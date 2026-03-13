# ROS2 Robot Control Web Interface

A web-based control dashboard for ROS2 guide robots. This web application communicates with the robot via WebSocket using rosbridge_server.

## Features

- **Robot Status Display**: Real-time display of battery level, robot state, position coordinates, and velocity
- **Teleop Control**: D-pad control for manual robot movement with adjustable speed
- **Navigation Control**: Input station numbers for navigation, create tour sequences
- **Quick Actions**: One-click buttons for "Return Home" and "Go to Charge"
- **System Logs**: Real-time operation logs display

## Prerequisites

### 1. ROS2 Environment
- ROS2 (Humble, Jazzy, or later recommended)
- rosbridge_suite package

Install rosbridge_suite:
```bash
sudo apt install ros-<distro>-rosbridge-server
```

### 2. Node.js Environment
- Node.js 18+
- pnpm (recommended) or npm

## Installation

1. Clone the repository:
```bash
git clone https://github.com/BoyuanTang331/ros_robotcontrol_web.git
cd ros_robotcontrol_web
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Build the project:
```bash
pnpm run build
# or
npm run build
```

4. The static files will be generated in the `dist/` folder.

## Running

### Option 1: Deploy as Static Web Server

After building, you can serve the `dist/` folder using any web server:

```bash
# Using Python
cd dist
python -m http.server 8000

# Using Node.js

npx serve dist
```

### Option 2: Connect to Robot

On your robot, start rosbridge_server:

```bash
# Terminal 1: Start rosbridge
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

The web interface will connect to `ws://localhost:9090` by default.

To connect to a remote robot, modify the WebSocket URL in `src/App.tsx`:

```typescript
// Change this line:
const ROSBRIDGE_URL = 'ws://192.168.1.100:9090'
```

## Robot-Side Requirements

Your robot needs to publish the following topics for full functionality:

| Topic | Message Type | Description |
|-------|-------------|-------------|
| `/battery_state` | `sensor_msgs/BatteryState` | Battery percentage (0-100%) |
| `/odom` | `nav_msgs/Odometry` | Robot position and velocity |
| `/robot_state` | `std_msgs/String` | Robot state (Running/Idle/Charging) |
| `/cmd_vel` | `geometry_msgs/Twist` | Velocity commands (subscribed) |
| `/station_arrival` | `std_msgs/Int32` | Navigation target (subscribed) |

If your robot doesn't publish these topics yet, you can create a simple node to mock the data or add the publishing logic to your existing driver nodes.

## Project Structure

```
ros_robotcontrol_web/
├── src/
│   ├── App.tsx          # Main React component with all UI and ROS logic
│   ├── App.css          # Styling for the control interface
│   ├── roslib.d.ts     # TypeScript definitions for roslib
│   ├── main.tsx        # React application entry point
│   └── index.css       # Global styles
├── public/              # Static assets
├── dist/               # Built production files
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
├── vite.config.ts     # Vite build configuration
└── index.html         # HTML entry point
```

## Development

Run development server:
```bash
pnpm run dev
```

## License

MIT License



# 根目录文件：

    README.md - 项目说明文档（含截图）

    package.json - 项目依赖配置

    index.html - HTML 入口文件

    vite.config.ts - Vite 构建配置

    tsconfig.json / tsconfig.app.json / tsconfig.node.json - TypeScript 配置

    tailwind.config.js / postcss.config.js - CSS 配置

    eslint.config.js - ESLint 配置

    components.json - UI 组件配置


# src 目录文件：

    src/App.tsx - 主 React 组件（含 ROS 通信逻辑）

    src/App.css - 样式文件

    src/main.tsx - React 入口

    src/index.css - 全局样式

    src/roslib.d.ts - TypeScript 类型定义




