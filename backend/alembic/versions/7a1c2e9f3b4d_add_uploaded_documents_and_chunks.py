"""add uploaded_documents and uploaded_chunks tables

Revision ID: 7a1c2e9f3b4d
Revises: c01f2afdae89
Create Date: 2026-07-11 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7a1c2e9f3b4d'
down_revision: Union[str, Sequence[str], None] = 'c01f2afdae89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'uploaded_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('raw_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_uploaded_documents_chat_id'),
        'uploaded_documents',
        ['chat_id'],
        unique=False,
    )

    op.create_table(
        'uploaded_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=True),
        sa.Column('chunk_text', sa.Text(), nullable=True),
        sa.Column('embedding', sa.JSON(), nullable=True),
        sa.Column('chunk_id', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['uploaded_documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_uploaded_chunks_document_id'),
        'uploaded_chunks',
        ['document_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_uploaded_chunks_document_id'), table_name='uploaded_chunks')
    op.drop_table('uploaded_chunks')
    op.drop_index(op.f('ix_uploaded_documents_chat_id'), table_name='uploaded_documents')
    op.drop_table('uploaded_documents')
