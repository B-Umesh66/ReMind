"""Persist the selected Ollama model per chat conversation."""
from alembic import op
import sqlalchemy as sa

revision = '20261022_0003'
down_revision = '20261022_0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'chat_conversations',
        sa.Column('model_preference', sa.String(128), nullable=False, server_default='qwen2.5:3b'),
    )


def downgrade():
    op.drop_column('chat_conversations', 'model_preference')
