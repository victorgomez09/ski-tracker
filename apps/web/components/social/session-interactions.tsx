import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useThemeColors, SPACING, BORDER_RADIUS, LIGHT_COLORS } from '../../constants/theme';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { socialService } from '../../services/social.service';
import { ReactionType, SessionComment, SessionReaction } from '../../models/social.model';

interface SessionInteractionsProps {
    sessionId: string;
    initialReactions?: SessionReaction[];
    initialComments?: SessionComment[];
}

const REACTIONS: { type: ReactionType; emoji: string; labelKey: string }[] = [
    { type: 'fire', emoji: '🔥', labelKey: 'reaction_fire' },
    { type: 'ski', emoji: '⛷️', labelKey: 'reaction_ski' },
    { type: 'snow', emoji: '❄️', labelKey: 'reaction_snow' },
    { type: 'clap', emoji: '👏', labelKey: 'reaction_clap' },
];

export const SessionInteractions: React.FC<SessionInteractionsProps> = ({
    sessionId,
    initialReactions = [],
    initialComments = [],
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();

    // Local reactions state
    const [reactions, setReactions] = useState<SessionReaction[]>(initialReactions);
    const [comments, setComments] = useState<SessionComment[]>(initialComments);
    const [commentsExpanded, setCommentsExpanded] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Compute reaction counts and user reactions
    const reactionSummary = useMemo(() => {
        const counts: Record<ReactionType, number> = { fire: 0, ski: 0, snow: 0, clap: 0 };
        const userReactions = new Set<ReactionType>();

        reactions.forEach((r) => {
            if (counts[r.reaction_type] !== undefined) {
                counts[r.reaction_type]++;
            }
            if (currentUser && r.user_id === currentUser.id) {
                userReactions.add(r.reaction_type);
            }
        });

        return { counts, userReactions };
    }, [reactions, currentUser]);

    // Handle reaction toggle
    const handleToggleReaction = async (type: ReactionType) => {
        if (!currentUser) return;

        // Optimistic UI update
        const hasReacted = reactionSummary.userReactions.has(type);
        if (hasReacted) {
            setReactions((prev) => prev.filter((r) => !(r.user_id === currentUser.id && r.reaction_type === type)));
        } else {
            const tempReaction: SessionReaction = {
                id: `temp-${Date.now()}`,
                session_id: sessionId,
                user_id: currentUser.id,
                reaction_type: type,
                created_at: new Date().toISOString(),
                user: currentUser,
            };
            setReactions((prev) => [...prev, tempReaction]);
        }

        try {
            await socialService.toggleReaction(sessionId, type);
        } catch (error) {
            console.error('Failed to toggle reaction:', error);
            // Revert on error
            setReactions(initialReactions);
            showToast(t('failed_reaction') || 'Error al reaccionar', 'error');
        }
    };

    // Handle adding a new comment
    const handleAddComment = async () => {
        const text = newCommentText.trim();
        if (!text || isSubmittingComment || !currentUser) return;

        setIsSubmittingComment(true);
        try {
            const created = await socialService.addComment(sessionId, text);
            setComments((prev) => [...prev, created]);
            setNewCommentText('');
        } catch (error) {
            console.error('Failed to add comment:', error);
            showToast(t('failed_comment') || 'Error al publicar comentario', 'error');
        } finally {
            setIsSubmittingComment(false);
        }
    };

    // Handle deleting a comment
    const handleDeleteComment = async (commentId: string) => {
        try {
            await socialService.deleteComment(sessionId, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
            showToast(t('comment_deleted') || 'Comentario eliminado', 'success');
        } catch (error) {
            console.error('Failed to delete comment:', error);
            showToast(t('failed_delete_comment') || 'Error al eliminar comentario', 'error');
        }
    };

    // Render formatted comment text with highlighted mentions (@username)
    const renderCommentContent = (content: string) => {
        const words = content.split(' ');
        return words.map((word, idx) => {
            if (word.startsWith('@') && word.length > 1) {
                return (
                    <Text key={idx} style={styles.mentionText}>
                        {word}{' '}
                    </Text>
                );
            }
            return <Text key={idx}>{word} </Text>;
        });
    };

    return (
        <View style={styles.container}>
            {/* Reactions (Kudos) Row & Comments Counter */}
            <View style={styles.interactionsBar}>
                {/* 4 Thematic Kudos Buttons */}
                <View style={styles.reactionsGroup}>
                    {REACTIONS.map((item) => {
                        const count = reactionSummary.counts[item.type];
                        const isActive = reactionSummary.userReactions.has(item.type);

                        return (
                            <TouchableOpacity
                                key={item.type}
                                style={[styles.reactionButton, isActive && styles.reactionButtonActive]}
                                onPress={() => handleToggleReaction(item.type)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.reactionEmoji}>{item.emoji}</Text>
                                {count > 0 && (
                                    <Text style={[styles.reactionCount, isActive && styles.reactionCountActive]}>
                                        {count}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Comment Toggle Button */}
                <TouchableOpacity
                    style={[styles.commentTrigger, commentsExpanded && styles.commentTriggerActive]}
                    onPress={() => setCommentsExpanded(!commentsExpanded)}
                    activeOpacity={0.7}
                >
                    <MessageSquare
                        size={14}
                        color={commentsExpanded ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.commentCountText, commentsExpanded && { color: colors.primary }]}>
                        {comments.length}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Expandable Comments Thread */}
            {commentsExpanded && (
                <View style={styles.commentsSection}>
                    {comments.length > 0 ? (
                        <View style={styles.commentsList}>
                            {comments.map((comment) => {
                                const isAuthor = currentUser?.id === comment.user_id;
                                const authorName =
                                    comment.user?.display_name ||
                                    `${comment.user?.first_name || ''} ${comment.user?.last_name || ''}`.trim() ||
                                    'Rider';
                                const initials = (authorName[0] || 'U').toUpperCase();

                                return (
                                    <View key={comment.id} style={styles.commentItem}>
                                        <View style={styles.commentAvatar}>
                                            {comment.user?.avatar_url ? (
                                                <Image
                                                    source={{ uri: comment.user.avatar_url }}
                                                    style={styles.avatarImg}
                                                />
                                            ) : (
                                                <Text style={styles.avatarInitials}>{initials}</Text>
                                            )}
                                        </View>

                                        <View style={styles.commentBody}>
                                            <View style={styles.commentHeader}>
                                                <Text style={styles.commentAuthor}>{authorName}</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Text style={styles.commentTime}>
                                                        {new Date(comment.created_at).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </Text>
                                                    {isAuthor && (
                                                        <TouchableOpacity
                                                            onPress={() => handleDeleteComment(comment.id)}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        >
                                                            <Trash2 size={12} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </View>
                                            <Text style={styles.commentContent}>
                                                {renderCommentContent(comment.content)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <Text style={styles.noCommentsText}>
                            {t('no_comments_yet', 'Sé el primero en comentar')}
                        </Text>
                    )}

                    {/* New Comment Input */}
                    <View style={styles.commentInputRow}>
                        <TextInput
                            style={styles.commentInput}
                            placeholder={t('write_comment_placeholder', 'Escribe un comentario (@usuario)...')}
                            placeholderTextColor={colors.textLight}
                            value={newCommentText}
                            onChangeText={setNewCommentText}
                            multiline={false}
                            returnKeyType="send"
                            onSubmitEditing={handleAddComment}
                        />
                        <TouchableOpacity
                            style={[
                                styles.sendButton,
                                (!newCommentText.trim() || isSubmittingComment) && styles.sendButtonDisabled,
                            ]}
                            onPress={handleAddComment}
                            disabled={!newCommentText.trim() || isSubmittingComment}
                        >
                            {isSubmittingComment ? (
                                <ActivityIndicator size="small" color={colors.textOnPrimary} />
                            ) : (
                                <Send size={14} color={colors.textOnPrimary} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        container: {
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: colors.border,
        },
        interactionsBar: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        reactionsGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        reactionButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
        },
        reactionButtonActive: {
            backgroundColor: '#eff6ff',
            borderColor: colors.primary,
        },
        reactionEmoji: {
            fontSize: 14,
        },
        reactionCount: {
            fontSize: 11,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        reactionCountActive: {
            color: colors.primary,
        },
        commentTrigger: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
        },
        commentTriggerActive: {
            borderColor: colors.primary,
            backgroundColor: '#eff6ff',
        },
        commentCountText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        commentsSection: {
            marginTop: 10,
            paddingTop: 8,
            borderTopWidth: 1,
            borderColor: colors.border,
            gap: 8,
        },
        commentsList: {
            gap: 8,
        },
        commentItem: {
            flexDirection: 'row',
            gap: 8,
            alignItems: 'flex-start',
        },
        commentAvatar: {
            width: 24,
            height: 24,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
        },
        avatarImg: {
            width: '100%',
            height: '100%',
        },
        avatarInitials: {
            fontSize: 10,
            fontWeight: 'bold',
            color: colors.primaryDark,
        },
        commentBody: {
            flex: 1,
            backgroundColor: colors.background,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        commentHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2,
        },
        commentAuthor: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        commentTime: {
            fontSize: 9,
            color: colors.textSecondary,
        },
        commentContent: {
            fontSize: 12,
            color: colors.textPrimary,
            lineHeight: 16,
        },
        mentionText: {
            color: colors.primary,
            fontWeight: '700',
        },
        noCommentsText: {
            fontSize: 11,
            color: colors.textSecondary,
            fontStyle: 'italic',
            textAlign: 'center',
            marginVertical: 4,
        },
        commentInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
        },
        commentInput: {
            flex: 1,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 12,
            color: colors.textPrimary,
        },
        sendButton: {
            backgroundColor: colors.primary,
            width: 32,
            height: 32,
            borderRadius: BORDER_RADIUS.round,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sendButtonDisabled: {
            opacity: 0.4,
        },
    });
