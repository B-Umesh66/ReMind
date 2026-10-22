"""Add persistent AI study assistant conversations."""
from alembic import op
import sqlalchemy as sa

revision = '20261022_0002'
down_revision = '20261019_0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chat_conversations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(160), nullable=False, server_default='New study chat'),
        sa.Column('provider_preference', sa.String(16), nullable=False, server_default='auto'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_chat_conversations_user_id', 'chat_conversations', ['user_id'])
    op.create_index('ix_chat_conversations_user_updated', 'chat_conversations', ['user_id', 'updated_at'])
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('chat_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('provider_used', sa.String(16)),
        sa.Column('model_used', sa.String(128)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('generation_duration_ms', sa.Integer()),
        sa.Column('status', sa.String(16), nullable=False, server_default='complete'),
        sa.CheckConstraint("role IN ('user', 'assistant')", name='ck_chat_messages_role'),
    )
    op.create_index('ix_chat_messages_conversation_id', 'chat_messages', ['conversation_id'])
    op.create_index('ix_chat_messages_conversation_created', 'chat_messages', ['conversation_id', 'created_at'])


def downgrade():
    op.drop_index('ix_chat_messages_conversation_created', table_name='chat_messages')
    op.drop_index('ix_chat_messages_conversation_id', table_name='chat_messages')
    op.drop_table('chat_messages')
    op.drop_index('ix_chat_conversations_user_updated', table_name='chat_conversations')
    op.drop_index('ix_chat_conversations_user_id', table_name='chat_conversations')
    op.drop_table('chat_conversations')
