import { User } from './user.model';
import { Resort } from './ski-resort.model';

export type ReactionType = 'fire' | 'ski' | 'snow' | 'clap';

export interface SessionReaction {
    id: string;
    session_id: string;
    user_id: string;
    reaction_type: ReactionType;
    created_at: string;
    user?: User;
}

export interface ReactionSummary {
    counts: Record<ReactionType, number>;
    user_reactions: ReactionType[];
    total: number;
}

export interface SessionComment {
    id: string;
    session_id: string;
    user_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    user?: User;
}

export interface CrewMember {
    id: string;
    crew_id: string;
    user_id: string;
    role: 'admin' | 'member';
    joined_at: string;
    user?: User;
}

export interface CrewPhoto {
    id: string;
    crew_id: string;
    user_id: string;
    photo_url: string;
    caption?: string;
    created_at: string;
    user?: User;
}

export interface Crew {
    id: string;
    name: string;
    description?: string;
    resort_id?: string;
    created_by: string;
    cover_image_url?: string;
    created_at: string;
    updated_at: string;
    creator?: User;
    members?: CrewMember[];
    photos?: CrewPhoto[];
    member_count?: number;
    resort?: Resort;
}
