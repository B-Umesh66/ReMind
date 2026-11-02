"""Add user profile columns managed by Alembic."""
from alembic import op
import sqlalchemy as sa

revision = '20261102_0004'
down_revision = '20261022_0003'
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'display_name' not in columns:
        op.add_column('users', sa.Column('display_name', sa.String(120), nullable=True, server_default=''))
    if 'workspace_name' not in columns:
        op.add_column(
            'users',
            sa.Column('workspace_name', sa.String(120), nullable=True, server_default='Personal Workspace'),
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {column['name'] for column in inspector.get_columns('users')}
    if 'workspace_name' in columns:
        op.drop_column('users', 'workspace_name')
    if 'display_name' in columns:
        op.drop_column('users', 'display_name')
