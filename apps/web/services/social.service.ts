import api from '../interceptor/api';
import { API_BASE_URL } from '../constants/constants';
import { Crew, CrewMember, CrewPhoto, ReactionSummary, ReactionType, SessionComment, SessionReaction } from '../models/social.model';

export const socialService = {
    // 5.1 Reactions (Kudos)
    async toggleReaction(sessionId: string, reactionType: ReactionType): Promise<{ added: boolean; summary: ReactionSummary }> {
        const response = await api.post(`${API_BASE_URL}/sessions/${sessionId}/reactions`, {
            reaction_type: reactionType,
        });
        return response.data;
    },

    async getReactions(sessionId: string): Promise<{ reactions: SessionReaction[]; summary?: ReactionSummary }> {
        const response = await api.get(`${API_BASE_URL}/sessions/${sessionId}/reactions`);
        return response.data;
    },

    // 5.1 Comments
    async addComment(sessionId: string, content: string): Promise<SessionComment> {
        const response = await api.post(`${API_BASE_URL}/sessions/${sessionId}/comments`, { content });
        return response.data;
    },

    async getComments(sessionId: string): Promise<SessionComment[]> {
        const response = await api.get(`${API_BASE_URL}/sessions/${sessionId}/comments`);
        return response.data;
    },

    async deleteComment(sessionId: string, commentId: string): Promise<void> {
        await api.delete(`${API_BASE_URL}/sessions/${sessionId}/comments/${commentId}`);
    },

    // 5.2 Crews (Ski Groups)
    async listUserCrews(): Promise<Crew[]> {
        const response = await api.get(`${API_BASE_URL}/crews`);
        return response.data;
    },

    async createCrew(data: { name: string; description?: string; resort_id?: string; cover_image_url?: string }): Promise<Crew> {
        const response = await api.post(`${API_BASE_URL}/crews`, data);
        return response.data;
    },

    async getCrew(crewId: string): Promise<Crew> {
        const response = await api.get(`${API_BASE_URL}/crews/${crewId}`);
        return response.data;
    },

    async joinCrew(crewId: string): Promise<void> {
        await api.post(`${API_BASE_URL}/crews/${crewId}/join`);
    },

    async leaveCrew(crewId: string): Promise<void> {
        await api.post(`${API_BASE_URL}/crews/${crewId}/leave`);
    },

    async addCrewMember(crewId: string, userId: string, role = 'member'): Promise<void> {
        await api.post(`${API_BASE_URL}/crews/${crewId}/members`, { user_id: userId, role });
    },

    async removeCrewMember(crewId: string, userId: string): Promise<void> {
        await api.delete(`${API_BASE_URL}/crews/${crewId}/members/${userId}`);
    },

    async addCrewPhoto(crewId: string, photoUrl: string, caption?: string): Promise<CrewPhoto> {
        const response = await api.post(`${API_BASE_URL}/crews/${crewId}/photos`, { photo_url: photoUrl, caption });
        return response.data;
    },

    async listCrewPhotos(crewId: string): Promise<CrewPhoto[]> {
        const response = await api.get(`${API_BASE_URL}/crews/${crewId}/photos`);
        return response.data;
    },

    async getCrewLeaderboard(crewId: string, metric = 'distance'): Promise<any[]> {
        const response = await api.get(`${API_BASE_URL}/crews/${crewId}/leaderboard?metric=${metric}`);
        return response.data;
    },

    async getCrewLiveLocations(crewId: string): Promise<any[]> {
        const response = await api.get(`${API_BASE_URL}/crews/${crewId}/live-locations`);
        return response.data;
    },

    // 5.3 Ghost Mode
    async setGhostMode(enabled: boolean): Promise<{ ghost_mode: boolean }> {
        const response = await api.post(`${API_BASE_URL}/users/ghost-mode`, { ghost_mode: enabled });
        return response.data;
    },
};
