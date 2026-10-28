export interface MeetingPoint {
    id: string;
    created_by: string;
    crew_id?: string | null;
    resort_id: string;
    title: string;
    description?: string;
    latitude: number;
    longitude: number;
    meet_time?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;

    creator?: {
        id: string;
        display_name?: string;
        first_name?: string;
        last_name?: string;
        avatar_url?: string;
    };
    crew?: {
        id: string;
        name: string;
    };
    can_delete?: boolean;
}

export interface CreateMeetingPointDto {
    resort_id: string;
    title: string;
    description?: string;
    latitude: number;
    longitude: number;
    meet_time?: string;
    crew_id?: string;
}
