declare module 'roslib' {
    export class Ros {
        constructor(options: { url: string });
        on(event: string, callback: (event?: any) => void): void;
        close(): void;
    }

    export class Topic {
        constructor(options: { ros: Ros; name: string; messageType: string });
        subscribe(callback: (message: any) => void): void;
        unsubscribe(callback?: (message: any) => void): void;
        publish(message: any): void;
    }

    export class Message {
        constructor(message: any);
    }

    export class ActionClient {
        constructor(options: { ros: Ros; serverName: string; actionName: string });
        sendGoal(goal: any, resultCallback?: (result: any) => void, feedbackCallback?: (feedback: any) => void): void;
    }

    export class Param {
        constructor(options: { ros: Ros; name: string });
        get(callback: (value: any) => void): void;
        set(value: any, callback?: () => void): void;
    }

    export class Service {
        constructor(options: { ros: Ros; name: string; serviceType: string });
        callService(request: any, callback: (response: any) => void): void;
    }
}
