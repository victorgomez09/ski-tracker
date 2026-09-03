import { Resort } from "./ski-resort.model";
import { User } from "./user.model";

export interface Session {
    id: string;
    user_id: string;
    resort_id?: string | null;
    start_time: string;
    end_time?: string | null;
    total_distance: number;
    max_speed: number;
    vertical_drop: number;
    avg_speed?: number;
    elevation_gain?: number;
    elevation_loss?: number;
    moving_time?: number;
    duration?: number;
    pace?: number;
    activity_type: string;
    is_public: boolean;
    created_at: string;
    user: User;
    runs?: SessionRun[];
    resort?: Resort | null;
    photos?: SessionPhoto[];
}

export interface SessionPhoto {
    id: string;
    session_id: string;
    photo_url: string;
    created_at: string;
}

export interface SessionRun {
    id: string;
    session_id: string;
    vertical_drop: number;
    max_speed: number;
    avg_speed: number;
    total_distance: number;
    elevation_gain: number;
    elevation_loss: number;
    total_points: number;
    matched_piste_id: string;
    predominant_diff: string;
    created_at: string;
    Session: any;
    MatchedPiste: any;
}