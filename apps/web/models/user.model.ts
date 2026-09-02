export interface User {
    display_name: string;
    email: string;
    first_name: string;
    id: string;
    last_name: string;
    activity_type: string;
    avatar_url: string | null;
    time_tracking: number;
    privacy_sessions?: string;
    privacy_live_location?: string;
    privacy_requests?: string;
}